use super::{server::MediaServer, transport};
use futures_util::StreamExt;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

#[tokio::test]
async fn real_http_ranges_head_and_revocation_preserve_media_capabilities()
-> Result<(), Box<dyn std::error::Error>> {
    let directory = tempfile::tempdir()?;
    let file = directory.path().join("fixture.mp4");
    tokio::fs::write(&file, b"0123456789").await?;
    let server = MediaServer::new();
    server.start().await?;
    let _shutdown = scopeguard::guard(server.clone(), |server| server.shutdown());
    let url = server.register(&file)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()?;
    let range = client.get(&url).header("Range", "bytes=3-5").send().await?;
    assert_eq!(range.status(), 206);
    assert_eq!(range.headers()["Content-Range"], "bytes 3-5/10");
    assert_eq!(range.text().await?, "345");
    let head = client.head(&url).send().await?;
    assert_eq!(head.status(), 200);
    assert_eq!(head.headers()["Content-Length"], "10");
    assert_eq!(head.bytes().await?.len(), 0);
    let invalid = client
        .get(&url)
        .header("Range", "bytes=10-20")
        .send()
        .await?;
    assert_eq!(invalid.status(), 416);
    assert_eq!(invalid.headers()["Content-Range"], "bytes */10");
    let unauthorized = url.split('?').next().ok_or("missing URL path")?;
    assert_eq!(client.get(unauthorized).send().await?.status(), 404);
    assert_eq!(client.post(&url).send().await?.status(), 404);
    assert_eq!(server.register(&file)?, url);
    server.revoke(&url);
    assert!(!server.has(&url));
    assert_eq!(client.get(&url).send().await?.status(), 404);
    let replay = server.register(&file)?;
    assert_ne!(replay, url);
    assert_eq!(
        client.get(&replay).send().await?.text().await?,
        "0123456789"
    );
    Ok(())
}

#[tokio::test]
async fn active_body_fails_and_releases_file_after_its_capability_is_cancelled()
-> Result<(), Box<dyn std::error::Error>> {
    let directory = tempfile::tempdir()?;
    let path = directory.path().join("active.mp4");
    tokio::fs::write(&path, vec![1_u8; 200_000]).await?;
    let token = CancellationToken::new();
    let body = transport::body(tokio::fs::File::open(&path).await?, 200_000, token.clone());
    let mut data = body.into_data_stream();
    assert_eq!(
        data.next().await.ok_or("first chunk missing")??.len(),
        65_536
    );
    token.cancel();
    assert!(
        data.next()
            .await
            .ok_or("cancellation error missing")?
            .is_err()
    );
    drop(data);
    tokio::fs::remove_file(path).await?;
    Ok(())
}

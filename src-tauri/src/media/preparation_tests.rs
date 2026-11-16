use super::{
    tests::{fixture, service},
    *,
};
use std::ffi::OsString;
type TestResult = std::result::Result<(), Box<dyn std::error::Error>>;

#[tokio::test]
async fn simultaneous_preparations_publish_one_compatible_target_and_remove_their_temporary_files()
-> TestResult {
    let (service, directory) = service("publication");
    let _cleanup = scopeguard::guard(directory.clone(), |path| {
        let _ = std::fs::remove_dir_all(path);
    });
    let hymn = fixture(&service, &directory).await;
    let first = service.prepare_hymn(&hymn, 2, CancellationToken::new(), Arc::new(|_| {}));
    let second = service.prepare_hymn(&hymn, 2, CancellationToken::new(), Arc::new(|_| {}));
    let (first, second) = tokio::join!(first, second);
    let first = first?;
    assert_eq!(first, second?);
    assert!(cache::cached(&first).await?);
    let names: Vec<_> =
        std::fs::read_dir(directory.join("cache"))?.collect::<std::io::Result<Vec<_>>>()?;
    assert_eq!(names.len(), 2);
    assert!(
        names
            .iter()
            .all(|entry| !entry.file_name().to_string_lossy().contains(".tmp"))
    );
    Ok(())
}

#[tokio::test]
async fn instrumental_audio_conversion_preserves_the_original_h264_video_packets() -> TestResult {
    let (service, directory) = service("packet-copy");
    let _cleanup = scopeguard::guard(directory.clone(), |path| {
        let _ = std::fs::remove_dir_all(path);
    });
    let hymn = fixture(&service, &directory).await;
    let target = service
        .prepare_hymn(&hymn, 2, CancellationToken::new(), Arc::new(|_| {}))
        .await?;
    async fn video_hash(service: &MediaService, file: &Path) -> Result<Vec<u8>> {
        let mut arguments: Vec<OsString> =
            ["-v", "error", "-i"].iter().map(OsString::from).collect();
        arguments.push(file.as_os_str().to_owned());
        arguments.extend(
            [
                "-map",
                "0:v:0",
                "-c:v",
                "copy",
                "-bsf:v",
                "h264_mp4toannexb",
                "-f",
                "hash",
                "-hash",
                "sha256",
                "-",
            ]
            .iter()
            .map(OsString::from),
        );
        service
            .process
            .run(&service.ffmpeg, &arguments, &CancellationToken::new(), None)
            .await
    }
    assert_eq!(
        video_hash(&service, Path::new(&hymn.path)).await?,
        video_hash(&service, &target).await?
    );
    Ok(())
}

#[tokio::test]
async fn unsupported_source_video_is_transcoded_to_browser_compatible_h264() -> TestResult {
    let (service, directory) = service("transcode");
    let _cleanup = scopeguard::guard(directory.clone(), |path| {
        let _ = std::fs::remove_dir_all(path);
    });
    let file = directory.join("002 Fixture MPEG4.mkv");
    let mut arguments: Vec<OsString> = [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=160x90:r=10:d=2",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=330:duration=2",
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "mpeg4",
        "-c:a",
        "aac",
        "-shortest",
    ]
    .iter()
    .map(OsString::from)
    .collect();
    arguments.push(file.as_os_str().to_owned());
    service
        .process
        .run(&service.ffmpeg, &arguments, &CancellationToken::new(), None)
        .await?;
    let hymn = service.inspect_hymn(&file).await?;
    let target = service
        .prepare_hymn(&hymn, 1, CancellationToken::new(), Arc::new(|_| {}))
        .await?;
    let info = service.probe(&target, &CancellationToken::new()).await?;
    assert_eq!(
        info.streams
            .iter()
            .filter_map(|stream| stream.codec_name.as_deref())
            .collect::<Vec<_>>(),
        vec!["h264", "aac"]
    );
    Ok(())
}

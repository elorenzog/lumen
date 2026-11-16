use super::test_support::Fixture;
use serde_json::json;

#[tokio::test]
async fn phone_assets_are_allowlisted_and_do_not_return_the_pin() {
    let fixture = Fixture::new().await;
    for (path, mime) in [
        ("/", "text/html; charset=utf-8"),
        ("/remote.js", "text/javascript"),
        ("/remote.css", "text/css"),
    ] {
        let response = fixture
            .client
            .get(format!("{}{path}", fixture.url))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), 200);
        assert_eq!(response.headers()["content-type"], mime);
        assert!(
            !response
                .text()
                .await
                .unwrap()
                .contains(&fixture.service.info().pin)
        );
    }
    for path in [
        "/state.json",
        "/bibles/private.json",
        "/media/track.mp4",
        "/api/snapshot",
    ] {
        let response = fixture
            .client
            .get(format!("{}{path}", fixture.url))
            .send()
            .await
            .unwrap();
        assert!([401, 404].contains(&response.status().as_u16()));
        assert_eq!(response.headers()["x-frame-options"], "DENY");
    }
}

#[tokio::test]
async fn pairing_requires_origin_and_json_with_strict_fields() {
    let fixture = Fixture::new().await;
    let response = fixture
        .client
        .post(format!("{}/api/pair", fixture.url))
        .json(&json!({"pin":fixture.service.info().pin}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 403);
    let response = fixture
        .client
        .post(format!("{}/api/pair", fixture.url))
        .header("Origin", &fixture.url)
        .body("{}")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 415);
    let response = fixture
        .post(
            "/api/pair",
            json!({"pin":fixture.service.info().pin,"path":"private"}),
        )
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
    let response = fixture
        .client
        .post(format!("{}/api/pair", fixture.url))
        .header("Origin", &fixture.url)
        .header("Content-Type", "application/json")
        .body("{")
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 400);
}

#[tokio::test]
async fn starting_twice_reuses_listener_and_pin() {
    let fixture = Fixture::new().await;
    let previous = fixture.service.info();
    let next = fixture.service.start().await.unwrap();
    assert_eq!(previous.pin, next.pin);
    assert_eq!(previous.urls, next.urls);
}

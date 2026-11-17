use super::{test_support::Fixture, *};
use crate::error::{Error, Result};
use serde_json::json;

#[tokio::test]
async fn pairing_guards_state_and_rotation_revokes_sessions() {
    let fixture = Fixture::new().await;
    let endpoint = format!("{}/api/library", fixture.url);
    assert_eq!(
        fixture.client.get(&endpoint).send().await.unwrap().status(),
        401
    );
    let cookie = fixture.pair().await;
    let result = fixture
        .client
        .get(&endpoint)
        .header("Cookie", &cookie)
        .send()
        .await
        .unwrap();
    assert_eq!(result.status(), 200);
    assert_eq!(result.headers()["cache-control"], "no-store");
    assert_eq!(fixture.service.info().devices, 1);
    fixture.service.rotate();
    assert_eq!(
        fixture
            .client
            .get(&endpoint)
            .header("Cookie", cookie)
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
}

#[tokio::test]
async fn unsafe_commands_origins_hosts_and_file_routes_are_rejected() {
    let fixture = Fixture::new().await;
    let cookie = fixture.pair().await;
    for command in [
        json!({"type":"import-hymns","folder":true}),
        json!({"type":"volume","value":2}),
        json!({"type":"stop","path":"secret"}),
    ] {
        assert_eq!(
            fixture
                .post("/api/command", command)
                .header("Cookie", &cookie)
                .send()
                .await
                .unwrap()
                .status(),
            400
        );
    }
    assert_eq!(
        fixture
            .post("/api/pair", json!({"pin":"000000"}))
            .header("Origin", "https://example.com")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        fixture
            .client
            .get(format!("{}/api/library", fixture.url))
            .header("Host", "evil.example:1234")
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        fixture
            .client
            .get(format!("{}/package.json", fixture.url))
            .send()
            .await
            .unwrap()
            .status(),
        404
    );
    assert_eq!(
        fixture
            .client
            .head(&fixture.url)
            .send()
            .await
            .unwrap()
            .status(),
        405
    );
    let result = fixture
        .post("/api/command", json!({"type":"stop"}))
        .header("Cookie", &cookie)
        .send()
        .await
        .unwrap();
    assert_eq!(result.status(), 400);
    assert!(!result.text().await.unwrap().contains("C:/private"));
}

#[tokio::test]
async fn pin_attempts_and_json_payloads_are_bounded() {
    let fixture = Fixture::new().await;
    assert_eq!(
        fixture
            .post("/api/pair", json!({"pin":"1".repeat(9000)}))
            .send()
            .await
            .unwrap()
            .status(),
        413
    );
    for _ in 0..4 {
        assert_eq!(
            fixture
                .post("/api/pair", json!({"pin":"éééééé"}))
                .send()
                .await
                .unwrap()
                .status(),
            401
        );
    }
    assert_eq!(
        fixture
            .post("/api/pair", json!({"pin":"000000"}))
            .send()
            .await
            .unwrap()
            .status(),
        429
    );
}

#[tokio::test]
async fn logout_revokes_cookie_and_close_disables_listener() {
    let fixture = Fixture::new().await;
    let cookie = fixture.pair().await;
    assert_eq!(
        fixture
            .post("/api/logout", json!({}))
            .header("Cookie", &cookie)
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    assert_eq!(
        fixture
            .client
            .get(format!("{}/api/library", fixture.url))
            .header("Cookie", cookie)
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    fixture.service.close();
    assert!(!fixture.service.info().enabled);
    assert!(fixture.service.info().pin.is_empty());
}

#[test]
fn command_contract_rejects_invalid_bounds_and_unknown_fields() {
    for value in [
        json!({"type":"step","direction":0}),
        json!({"type":"reference","bibleId":"a","book":67,"chapter":1,"range":"1"}),
        json!({"type":"playback","position":86401}),
        json!({"type":"hymn","id":"a","track":-1}),
        json!({"type":"stop","path":"secret"}),
        json!({"type":"welcome","unexpected":true}),
        json!({"type":"playback","playing":null}),
    ] {
        let input = value.to_string();
        let parsed: Result<RemoteCommand> = serde_json::from_value(value)
            .map_err(Error::from)
            .and_then(RemoteCommand::validate);
        assert!(parsed.is_err(), "Accepted invalid command: {input}");
    }
}

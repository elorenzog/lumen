use super::{test_support::Fixture, *};
use crate::{
    data::models::Verse,
    models::{Output, Slide},
};
use serde_json::json;
use std::{sync::Arc, time::Duration};
use tokio::sync::Notify;

struct BlockAdapter {
    entered: Arc<Notify>,
    cancelled: Arc<Notify>,
    block: bool,
}
struct Cancelled(Arc<Notify>);
impl Drop for Cancelled {
    fn drop(&mut self) {
        self.0.notify_one();
    }
}
impl RemoteAdapter for BlockAdapter {
    fn state(&self) -> RemoteFuture<'_, RemoteState> {
        Box::pin(async { Ok(snapshot()) })
    }
    fn library(&self) -> RemoteFuture<'_, RemoteLibrary> {
        Box::pin(async { Ok(RemoteLibrary::default()) })
    }
    fn search(&self, _: RemoteSearch) -> RemoteFuture<'_, Vec<Verse>> {
        Box::pin(async { Ok(vec![]) })
    }
    fn command(&self, _: RemoteCommand) -> RemoteFuture<'_, RemoteState> {
        Box::pin(async {
            if !self.block {
                return Ok(snapshot());
            }
            let _cancelled = Cancelled(Arc::clone(&self.cancelled));
            self.entered.notify_one();
            std::future::pending().await
        })
    }
}
fn snapshot() -> RemoteState {
    RemoteState {
        output: Output {
            slide: Slide::Hymn {
                hymn_id: "test".into(),
                title: "Test".into(),
                track: 0,
                media_url: "http://127.0.0.1/private?token=secret".into(),
            },
            ..Output::default()
        },
        volume: 0.8,
        bibles: vec![],
        displays: vec![],
        program: vec![],
    }
}
#[tokio::test]
async fn close_cancels_an_in_flight_command_before_it_can_complete() {
    let entered = Arc::new(Notify::new());
    let cancelled = Arc::new(Notify::new());
    let fixture = Fixture::with_adapter(Arc::new(BlockAdapter {
        entered: Arc::clone(&entered),
        cancelled: Arc::clone(&cancelled),
        block: true,
    }))
    .await;
    let cookie = fixture.pair().await;
    let request = fixture
        .post("/api/command", json!({"type":"stop"}))
        .header("Cookie", cookie);
    let pending = tokio::spawn(async move { request.send().await });
    tokio::time::timeout(Duration::from_secs(2), entered.notified())
        .await
        .unwrap();
    fixture.service.close();
    tokio::time::timeout(Duration::from_secs(2), cancelled.notified())
        .await
        .unwrap();
    let response = tokio::time::timeout(Duration::from_secs(2), pending)
        .await
        .unwrap()
        .unwrap();
    if let Ok(response) = response {
        assert_eq!(response.status(), 503);
    }
    assert!(fixture.service.info().pin.is_empty());
}

#[tokio::test]
async fn state_redacts_loopback_media_tokens_even_when_adapter_includes_them() {
    let fixture = Fixture::with_adapter(Arc::new(BlockAdapter {
        entered: Arc::new(Notify::new()),
        cancelled: Arc::new(Notify::new()),
        block: false,
    }))
    .await;
    let cookie = fixture.pair().await;
    let response = fixture
        .client
        .get(format!("{}/api/state", fixture.url))
        .header("Cookie", cookie)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let value: serde_json::Value = response.json().await.unwrap();
    assert_eq!(value["output"]["slide"]["mediaUrl"], "");
    assert!(!value.to_string().contains("token=secret"));
}

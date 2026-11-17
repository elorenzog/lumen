use super::*;
use crate::{data::models::Verse, error::Error};
use serde_json::json;
use std::{path::PathBuf, sync::Arc};

struct Adapter;
impl RemoteAdapter for Adapter {
    fn state(&self) -> RemoteFuture<'_, RemoteState> {
        Box::pin(async { Err(Error::new("media", "C:/private/hymns/example.mkv")) })
    }
    fn library(&self) -> RemoteFuture<'_, RemoteLibrary> {
        Box::pin(async { Ok(RemoteLibrary::default()) })
    }
    fn search(&self, _: RemoteSearch) -> RemoteFuture<'_, Vec<Verse>> {
        Box::pin(async { Ok(vec![]) })
    }
    fn command(&self, _: RemoteCommand) -> RemoteFuture<'_, RemoteState> {
        self.state()
    }
}
pub(super) struct Fixture {
    pub service: RemoteService,
    pub client: reqwest::Client,
    pub url: String,
    assets: PathBuf,
}
impl Fixture {
    pub async fn new() -> Self {
        Self::with_adapter(Arc::new(Adapter)).await
    }
    pub async fn with_adapter(adapter: Arc<dyn RemoteAdapter>) -> Self {
        let assets = std::env::temp_dir().join(format!("lumen-remote-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&assets).unwrap();
        for (filename, content) in [
            ("index.html", "<p>Remote</p>"),
            ("remote.js", "/* Phone client */"),
            ("remote.css", "body{}"),
        ] {
            std::fs::write(assets.join(filename), content).unwrap();
        }
        let service = RemoteService::new(assets.clone(), adapter, Arc::new(|| {}));
        let info = service.start().await.unwrap();
        let port = reqwest::Url::parse(&info.urls[0]).unwrap().port().unwrap();
        Self {
            service,
            assets,
            url: format!("http://127.0.0.1:{port}"),
            client: reqwest::Client::new(),
        }
    }
    pub fn post(&self, path: &str, value: serde_json::Value) -> reqwest::RequestBuilder {
        self.client
            .post(format!("{}{path}", self.url))
            .header("Origin", &self.url)
            .json(&value)
    }
    pub async fn pair(&self) -> String {
        let result = self
            .post("/api/pair", json!({"pin": self.service.info().pin}))
            .send()
            .await
            .unwrap();
        assert_eq!(result.status(), 200);
        let cookie = result.headers()["set-cookie"].to_str().unwrap();
        assert!(cookie.contains("HttpOnly; SameSite=Strict; Path=/; Max-Age=28800"));
        cookie.split(';').next().unwrap().to_owned()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.service.close();
        std::fs::remove_dir_all(&self.assets).unwrap();
    }
}

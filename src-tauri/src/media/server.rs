use crate::error::{Error, Result};
use axum::{
    Router,
    body::Body,
    extract::{Request, State},
    http::{Method, StatusCode, header},
    response::{IntoResponse, Response},
};
use parking_lot::Mutex;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU16, Ordering},
    },
};
use tokio::{fs::File, io::AsyncSeekExt, net::TcpListener};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

#[derive(Clone)]
struct Entry {
    file: PathBuf,
    token: CancellationToken,
}
#[derive(Default)]
struct Registry {
    files: HashMap<String, Entry>,
    ids: HashMap<PathBuf, String>,
}

pub(super) struct MediaServer {
    secret: String,
    port: AtomicU16,
    registry: Mutex<Registry>,
    shutdown: CancellationToken,
    starting: tokio::sync::Mutex<()>,
    task: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl MediaServer {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            secret: format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple()),
            port: AtomicU16::new(0),
            registry: Mutex::new(Registry::default()),
            shutdown: CancellationToken::new(),
            starting: tokio::sync::Mutex::new(()),
            task: Mutex::new(None),
        })
    }
    pub async fn start(self: &Arc<Self>) -> Result<()> {
        let _starting = self.starting.lock().await;
        super::process::active(&self.shutdown)?;
        if self.port.load(Ordering::Acquire) != 0 {
            return Ok(());
        }
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0)).await?;
        self.port
            .store(listener.local_addr()?.port(), Ordering::Release);
        let router = Router::new().fallback(serve).with_state(Arc::clone(self));
        let stop = self.shutdown.clone();
        *self.task.lock() = Some(tokio::spawn(async move {
            let _ = axum::serve(listener, router)
                .with_graceful_shutdown(stop.cancelled_owned())
                .await;
        }));
        Ok(())
    }
    pub fn register(&self, file: &Path) -> Result<String> {
        super::process::active(&self.shutdown)?;
        let port = self.port.load(Ordering::Acquire);
        if port == 0 {
            return Err(Error::new(
                "server",
                "El reproductor local aún no está preparado.",
            ));
        }
        let mut registry = self.registry.lock();
        let id = if let Some(id) = registry.ids.get(file) {
            id.clone()
        } else {
            let id = Uuid::new_v4().to_string();
            registry.files.insert(
                id.clone(),
                Entry {
                    file: file.to_owned(),
                    token: self.shutdown.child_token(),
                },
            );
            registry.ids.insert(file.to_owned(), id.clone());
            id
        };
        Ok(format!(
            "http://127.0.0.1:{port}/{id}?token={}",
            self.secret
        ))
    }
    fn id<'a>(&self, url: &'a str) -> Option<&'a str> {
        let prefix = format!("http://127.0.0.1:{}/", self.port.load(Ordering::Acquire));
        let (id, token) = url.strip_prefix(&prefix)?.split_once("?token=")?;
        (token == self.secret).then_some(id)
    }
    #[cfg(test)]
    pub fn has(&self, url: &str) -> bool {
        self.id(url)
            .is_some_and(|id| self.registry.lock().files.contains_key(id))
    }
    pub fn revoke(&self, url: &str) {
        if let Some(id) = self.id(url) {
            let mut registry = self.registry.lock();
            if let Some(entry) = registry.files.remove(id) {
                registry.ids.remove(&entry.file);
                entry.token.cancel();
            }
        }
    }
    pub fn shutdown(&self) {
        self.shutdown.cancel();
        let mut registry = self.registry.lock();
        for entry in registry.files.values() {
            entry.token.cancel();
        }
        registry.files.clear();
        registry.ids.clear();
    }
}

async fn serve(State(server): State<Arc<MediaServer>>, request: Request) -> Response {
    match response(&server, request).await {
        Ok(response) => response,
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn response(server: &MediaServer, request: Request) -> Result<Response> {
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return Ok(StatusCode::NOT_FOUND.into_response());
    }
    let id = request.uri().path().strip_prefix('/').unwrap_or_default();
    let token = request
        .uri()
        .query()
        .and_then(|query| query.strip_prefix("token="));
    if token != Some(server.secret.as_str()) {
        return Ok(StatusCode::NOT_FOUND.into_response());
    }
    let entry = server
        .registry
        .lock()
        .files
        .get(id)
        .cloned()
        .ok_or_else(|| Error::new("server", "Medio no disponible."))?;
    let mut file = File::open(&entry.file).await?;
    let size = file.metadata().await?.len();
    if entry.token.is_cancelled() {
        return Ok(StatusCode::NOT_FOUND.into_response());
    }
    let range = request.headers().get(header::RANGE);
    let parsed = match range {
        Some(range) => range
            .to_str()
            .ok()
            .and_then(|value| byte_range(Some(value), size)),
        None => byte_range(None, size),
    };
    let Some((start, end)) = parsed else {
        let mut response = StatusCode::RANGE_NOT_SATISFIABLE.into_response();
        insert_header(
            &mut response,
            header::CONTENT_RANGE,
            &format!("bytes */{size}"),
        )?;
        return Ok(response);
    };
    file.seek(std::io::SeekFrom::Start(start)).await?;
    let length = end - start + 1;
    let body = if request.method() == Method::HEAD {
        Body::empty()
    } else {
        super::transport::body(file, length, entry.token)
    };
    let mut response = Response::new(body);
    *response.status_mut() = if range.is_some() {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };
    let mime = match entry
        .file
        .extension()
        .and_then(|extension| extension.to_str())
    {
        Some("png") => "image/png",
        Some("webm") => "video/webm",
        _ => "video/mp4",
    };
    for (name, value) in [
        (header::CONTENT_TYPE, mime.to_owned()),
        (header::X_CONTENT_TYPE_OPTIONS, "nosniff".into()),
        (header::ACCEPT_RANGES, "bytes".into()),
        (header::CONTENT_LENGTH, length.to_string()),
        (header::CACHE_CONTROL, "no-store".into()),
    ] {
        insert_header(&mut response, name, &value)?;
    }
    if range.is_some() {
        insert_header(
            &mut response,
            header::CONTENT_RANGE,
            &format!("bytes {start}-{end}/{size}"),
        )?;
    }
    Ok(response)
}

fn insert_header(response: &mut Response, name: header::HeaderName, value: &str) -> Result<()> {
    response.headers_mut().insert(
        name,
        value
            .parse()
            .map_err(|error| Error::new("server", format!("Cabecera no válida: {error}")))?,
    );
    Ok(())
}

pub(super) fn byte_range(range: Option<&str>, size: u64) -> Option<(u64, u64)> {
    let last = size.checked_sub(1)?;
    let (start, end) = match range {
        Some(value) => {
            let (start, end) = value.strip_prefix("bytes=")?.split_once('-')?;
            (
                start.parse::<u64>().ok()?,
                if end.is_empty() {
                    last
                } else {
                    end.parse::<u64>().ok()?.min(last)
                },
            )
        }
        None => (0, last),
    };
    (start <= end && start < size).then_some((start, end))
}

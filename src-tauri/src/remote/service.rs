use super::{
    RemoteAdapter, RemoteInfo, connection, response::Failure, routes, security, sessions::Sessions,
};
use crate::error::{Error, Result};
use parking_lot::Mutex;
use std::{net::Ipv4Addr, path::PathBuf, sync::Arc, time::Instant};
use tokio::{sync::watch, task::JoinHandle};

pub struct RemoteService {
    inner: Arc<Inner>,
}
pub(super) struct Inner {
    pub assets: PathBuf,
    pub adapter: Arc<dyn RemoteAdapter>,
    pub changed: Arc<dyn Fn() + Send + Sync>,
    pub sessions: Mutex<Sessions>,
    running: Mutex<Option<Running>>,
}
struct Running {
    port: u16,
    shutdown: watch::Sender<bool>,
    task: JoinHandle<()>,
}
#[derive(Clone)]
pub(super) struct HttpState {
    pub inner: Arc<Inner>,
    pub port: u16,
    pub shutdown: watch::Receiver<bool>,
}
impl RemoteService {
    pub fn new(
        assets: PathBuf,
        adapter: Arc<dyn RemoteAdapter>,
        changed: Arc<dyn Fn() + Send + Sync>,
    ) -> Self {
        Self {
            inner: Arc::new(Inner {
                assets,
                adapter,
                changed,
                sessions: Mutex::new(Sessions::default()),
                running: Mutex::new(None),
            }),
        }
    }
    pub async fn start(&self) -> Result<RemoteInfo> {
        {
            let mut running = self.inner.running.lock();
            if running.is_none() {
                let listener =
                    std::net::TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0)).map_err(|_| {
                        Error::new(
                            "remote-listen",
                            "No se pudo activar el control remoto. Revisa la conexión de red.",
                        )
                    })?;
                listener.set_nonblocking(true)?;
                let port = listener.local_addr()?.port();
                let listener = tokio::net::TcpListener::from_std(listener)?;
                self.inner.sessions.lock().rotate();
                let (shutdown, receiver) = watch::channel(false);
                let state = HttpState {
                    inner: Arc::clone(&self.inner),
                    port,
                    shutdown: receiver.clone(),
                };
                let router = axum::Router::new()
                    .fallback(routes::dispatch)
                    .layer(axum::middleware::from_fn_with_state(
                        state.clone(),
                        security::guard,
                    ))
                    .with_state(state);
                let task = tokio::spawn(connection::serve(listener, router, receiver));
                *running = Some(Running {
                    port,
                    shutdown,
                    task,
                });
            }
        }
        (self.inner.changed)();
        Ok(self.info())
    }
    pub fn info(&self) -> RemoteInfo {
        let port = self
            .inner
            .running
            .lock()
            .as_ref()
            .map(|running| running.port);
        let mut sessions = self.inner.sessions.lock();
        sessions.expire(Instant::now());
        let urls = port.map_or_else(Vec::new, |port| {
            let addresses = security::advertised_addresses();
            addresses
                .iter()
                .map(|ip| format!("http://{ip}:{port}"))
                .collect()
        });
        RemoteInfo {
            enabled: port.is_some(),
            urls,
            pin: sessions.pin.clone(),
            devices: sessions.devices(),
        }
    }
    pub fn rotate(&self) -> RemoteInfo {
        self.inner.sessions.lock().rotate();
        (self.inner.changed)();
        self.info()
    }
    pub fn close(&self) {
        let running = self.inner.running.lock().take();
        self.inner.sessions.lock().close();
        if let Some(running) = running {
            let _ = running.shutdown.send(true);
            running.task.abort();
        }
        (self.inner.changed)();
    }
}
impl Drop for RemoteService {
    fn drop(&mut self) {
        self.close();
    }
}

pub(super) fn unavailable() -> Failure {
    Failure::new(
        axum::http::StatusCode::SERVICE_UNAVAILABLE,
        "El control remoto está desactivado.",
    )
}

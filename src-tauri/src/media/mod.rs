#[cfg(test)]
mod background_tests;
mod backgrounds;
mod cache;
mod encoding;
#[cfg(test)]
mod preparation_tests;
mod prepare;
mod probe;
mod process;
#[cfg(test)]
mod process_tests;
mod server;
#[cfg(test)]
mod server_tests;
#[cfg(test)]
mod tests;
mod transport;

use crate::{
    data::models::Hymn,
    error::{Error, Result},
};
use parking_lot::Mutex;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Weak},
};
use tokio_util::sync::CancellationToken;

pub type StatusCallback = Arc<dyn Fn(String) + Send + Sync>;
type PublicationLocks = Arc<Mutex<HashMap<PathBuf, Weak<tokio::sync::Mutex<()>>>>>;

#[derive(Clone)]
pub struct MediaService {
    ffmpeg: PathBuf,
    ffprobe: PathBuf,
    cache: PathBuf,
    process: process::ProcessRunner,
    server: Arc<server::MediaServer>,
    publications: PublicationLocks,
}

impl MediaService {
    pub fn new(ffmpeg: PathBuf, ffprobe: PathBuf, cache: PathBuf) -> Result<Self> {
        for binary in [&ffmpeg, &ffprobe] {
            if !binary.is_file() {
                return Err(Error::new(
                    "media-tool",
                    format!("No se encontró el motor multimedia: {}", binary.display()),
                ));
            }
        }
        Ok(Self {
            ffmpeg,
            ffprobe,
            cache,
            process: process::ProcessRunner {
                shutdown: CancellationToken::new(),
            },
            server: server::MediaServer::new(),
            publications: Arc::default(),
        })
    }

    pub async fn start(&self) -> Result<()> {
        self.server.start().await
    }
    pub fn register(&self, file: &Path) -> Result<String> {
        self.server.register(file)
    }
    pub fn revoke(&self, url: &str) {
        self.server.revoke(url);
    }
    pub fn shutdown(&self) {
        self.process.shutdown.cancel();
        self.server.shutdown();
    }

    pub async fn prepare_hymn(
        &self,
        hymn: &Hymn,
        track: u32,
        token: CancellationToken,
        status: StatusCallback,
    ) -> Result<PathBuf> {
        self.prepare(hymn, track, &token, status).await
    }

    fn publication_lock(&self, target: &Path) -> Arc<tokio::sync::Mutex<()>> {
        let mut locks = self.publications.lock();
        locks.retain(|_, lock| lock.strong_count() > 0);
        if let Some(lock) = locks.get(target).and_then(Weak::upgrade) {
            return lock;
        }
        let lock = Arc::new(tokio::sync::Mutex::new(()));
        locks.insert(target.to_owned(), Arc::downgrade(&lock));
        lock
    }
}

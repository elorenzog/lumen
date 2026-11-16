use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::io::AsyncReadExt;
use tokio_util::sync::CancellationToken;

#[derive(Deserialize, Serialize)]
pub(super) struct Completion {
    pub version: u32,
    pub size: u64,
}

pub(super) fn suffix(file: &Path, extension: &str) -> PathBuf {
    let mut name = file.as_os_str().to_owned();
    name.push(extension);
    PathBuf::from(name)
}

pub(super) async fn cached(target: &Path) -> Result<bool> {
    match valid(target).await {
        Ok(value) => Ok(value),
        Err(error)
            if error.kind() == std::io::ErrorKind::NotFound
                || error.kind() == std::io::ErrorKind::UnexpectedEof =>
        {
            Ok(false)
        }
        Err(error) => Err(error.into()),
    }
}

async fn valid(target: &Path) -> std::io::Result<bool> {
    let record = tokio::fs::read(suffix(target, ".json")).await?;
    let Ok(record) = serde_json::from_slice::<Completion>(&record) else {
        return Ok(false);
    };
    if record.version != 2
        || record.size < 12
        || tokio::fs::metadata(target).await?.len() != record.size
    {
        return Ok(false);
    }
    let mut file = tokio::fs::File::open(target).await?;
    let mut header = [0_u8; 12];
    file.read_exact(&mut header).await?;
    Ok(&header[4..8] == b"ftyp")
}

pub(super) async fn acquire<'a>(
    lock: &'a tokio::sync::Mutex<()>,
    token: &CancellationToken,
) -> Result<tokio::sync::MutexGuard<'a, ()>> {
    tokio::select! {
        biased;
        _ = token.cancelled() => Err(Error::cancelled()),
        guard = lock.lock() => Ok(guard),
    }
}

pub(super) struct TemporaryFiles(pub Vec<PathBuf>);
impl TemporaryFiles {
    pub fn persist(mut self) {
        self.0.clear();
    }
}
impl Drop for TemporaryFiles {
    fn drop(&mut self) {
        for file in &self.0 {
            let _ = std::fs::remove_file(file);
        }
    }
}

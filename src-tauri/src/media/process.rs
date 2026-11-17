use crate::error::{Error, Result};
use std::{ffi::OsString, path::Path, process::Stdio, sync::Arc};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::Command,
};
use tokio_util::sync::CancellationToken;

pub(super) type Progress = Arc<dyn Fn(&str) + Send + Sync>;

#[derive(Clone)]
pub(super) struct ProcessRunner {
    pub shutdown: CancellationToken,
}

pub(super) fn active(token: &CancellationToken) -> Result<()> {
    if token.is_cancelled() {
        return Err(Error::cancelled());
    }
    Ok(())
}

impl ProcessRunner {
    pub async fn run(
        &self,
        binary: &Path,
        arguments: &[OsString],
        token: &CancellationToken,
        progress: Option<Progress>,
    ) -> Result<Vec<u8>> {
        active(token)?;
        active(&self.shutdown)?;
        let mut command = Command::new(binary);
        command
            .args(arguments)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x0800_0000);
        let mut child = command.spawn().map_err(|error| {
            Error::new(
                "media-tool",
                format!("No se pudo iniciar el motor multimedia: {error}"),
            )
        })?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| Error::new("media-tool", "Salida multimedia no disponible."))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| Error::new("media-tool", "Diagnóstico multimedia no disponible."))?;
        let wait = async {
            tokio::select! {
                biased;
                _ = token.cancelled() => { child.kill().await?; Err(Error::cancelled()) },
                _ = self.shutdown.cancelled() => { child.kill().await?; Err(Error::cancelled()) },
                result = child.wait() => Ok(result?),
            }
        };
        let (status, output, diagnostic) = tokio::join!(
            wait,
            capture(stdout, progress, false),
            capture(stderr, None, true)
        );
        let status = status?;
        active(token)?;
        active(&self.shutdown)?;
        let diagnostic = diagnostic?;
        if !status.success() {
            let diagnostic = String::from_utf8_lossy(&diagnostic);
            let tail: String = diagnostic
                .chars()
                .rev()
                .take(600)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect();
            return Err(Error::new(
                "media",
                format!("El motor multimedia no pudo procesar el archivo ({status}). {tail}"),
            ));
        }
        output
    }
}

async fn capture(
    mut reader: impl AsyncRead + Unpin,
    progress: Option<Progress>,
    tail: bool,
) -> Result<Vec<u8>> {
    let mut output = Vec::new();
    let mut chunk = [0_u8; 8192];
    loop {
        let count = reader.read(&mut chunk).await?;
        if count == 0 {
            break;
        }
        if let Some(callback) = &progress {
            callback(&String::from_utf8_lossy(&chunk[..count]));
        }
        output.extend_from_slice(&chunk[..count]);
        if tail && output.len() > 4000 {
            output.drain(..output.len() - 4000);
        }
        if output.len() > 16 * 1024 * 1024 {
            return Err(Error::new(
                "media",
                "La respuesta multimedia supera el límite permitido.",
            ));
        }
    }
    Ok(output)
}

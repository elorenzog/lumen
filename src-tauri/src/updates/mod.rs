use crate::{
    core::Core,
    error::{Error, Result},
};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub status: String,
    pub version: String,
    pub notes: String,
    pub progress: u8,
    pub message: String,
    pub check_at_startup: bool,
    pub installable: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Preference {
    check_at_startup: bool,
}

struct Inner {
    app: AppHandle,
    directory: PathBuf,
    info: Mutex<UpdateInfo>,
    available: Mutex<Option<Update>>,
    bytes: Mutex<Option<Arc<Vec<u8>>>>,
    operation: tokio::sync::Mutex<()>,
}

#[derive(Clone)]
pub struct UpdateService(Arc<Inner>);

impl UpdateService {
    pub fn new(app: AppHandle, directory: &Path) -> Self {
        let preference = std::fs::read(directory.join("updates.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Preference>(&bytes).ok());
        let installable = !cfg!(debug_assertions)
            && std::env::var_os("LUMEN_PORTABLE").is_none()
            && std::env::current_exe()
                .ok()
                .and_then(|exe| exe.parent().map(Path::to_path_buf))
                .is_some_and(|folder| folder.join("uninstall.exe").exists());
        Self(Arc::new(Inner {
            app,
            directory: directory.to_path_buf(),
            info: Mutex::new(UpdateInfo {
                current_version: env!("CARGO_PKG_VERSION").to_owned(),
                status: "idle".into(),
                version: String::new(),
                notes: String::new(),
                progress: 0,
                message: "Busca una nueva versión en GitHub.".into(),
                check_at_startup: preference.is_none_or(|value| value.check_at_startup),
                installable,
            }),
            available: Mutex::new(None),
            bytes: Mutex::new(None),
            operation: tokio::sync::Mutex::new(()),
        }))
    }

    pub fn snapshot(&self) -> UpdateInfo {
        self.0.info.lock().clone()
    }

    fn changed(&self, mutate: impl FnOnce(&mut UpdateInfo)) {
        mutate(&mut self.0.info.lock());
        if let Some(core) = self.0.app.try_state::<Arc<Core>>() {
            core.broadcast();
        }
    }

    fn failed(&self, error: impl std::fmt::Display) {
        eprintln!("lumen.updater.failed: {error}");
        self.changed(|info| {
            info.status = "error".into();
            info.message = "No se pudo consultar o descargar la actualización. Comprueba la conexión y vuelve a intentar.".into();
        });
    }

    pub async fn preference(&self, check_at_startup: bool) -> Result<()> {
        let bytes = serde_json::to_vec(&Preference { check_at_startup })?;
        tokio::fs::write(self.0.directory.join("updates.json"), bytes).await?;
        self.changed(|info| info.check_at_startup = check_at_startup);
        Ok(())
    }

    pub async fn check(&self) -> Result<()> {
        let Ok(_operation) = self.0.operation.try_lock() else {
            return Ok(());
        };
        if self.snapshot().status == "downloaded" {
            return Ok(());
        }
        self.changed(|info| {
            info.status = "checking".into();
            info.message = "Buscando actualizaciones.".into();
        });
        let updater = match self
            .0
            .app
            .updater_builder()
            .timeout(Duration::from_secs(20))
            .build()
        {
            Ok(updater) => updater,
            Err(error) => {
                self.failed(error);
                return Ok(());
            }
        };
        match updater.check().await {
            Ok(Some(update)) => {
                self.changed(|info| {
                    info.status = "available".into();
                    info.version.clone_from(&update.version);
                    info.notes = update.body.clone().unwrap_or_default();
                    info.progress = 0;
                    info.message = format!("Disponible LUMEN {}.", update.version);
                });
                *self.0.available.lock() = Some(update);
                *self.0.bytes.lock() = None;
            }
            Ok(None) => self.changed(|info| {
                info.status = "current".into();
                info.message = "LUMEN está actualizado.".into();
            }),
            Err(error) => self.failed(error),
        }
        Ok(())
    }

    pub async fn download(&self) -> Result<()> {
        let Ok(_operation) = self.0.operation.try_lock() else {
            return Ok(());
        };
        if !self.snapshot().installable {
            return Err(Error::new(
                "updater-mode",
                "Instala LUMEN desde GitHub para recibir actualizaciones dentro de la aplicación.",
            ));
        }
        let update = self.0.available.lock().clone().ok_or_else(|| {
            Error::new(
                "updater-state",
                "Busca primero una actualización disponible.",
            )
        })?;
        self.changed(|info| {
            info.status = "downloading".into();
            info.progress = 0;
            info.message = "Descargando actualización.".into();
        });
        let mut received = 0_u64;
        match update
            .download(
                |length, total| {
                    received = received.saturating_add(u64::try_from(length).unwrap_or(u64::MAX));
                    let progress = total.filter(|value| *value > 0).map_or(0, |total| {
                        u8::try_from(
                            received
                                .saturating_mul(100)
                                .checked_div(total)
                                .unwrap_or_default()
                                .min(99),
                        )
                        .unwrap_or(99)
                    });
                    if self.snapshot().progress != progress {
                        self.changed(|info| {
                            info.progress = progress;
                            info.message = format!("Descargando actualización · {progress}%");
                        });
                    }
                },
                || {},
            )
            .await
        {
            Ok(bytes) => {
                *self.0.bytes.lock() = Some(Arc::new(bytes));
                self.changed(|info| {
                    info.status = "downloaded".into();
                    info.progress = 100;
                    info.message =
                        "Actualización verificada. Instálala cuando termine la proyección.".into();
                });
            }
            Err(error) => self.failed(error),
        }
        Ok(())
    }

    pub async fn install(&self, blocked: bool) -> Result<()> {
        if blocked {
            return Err(Error::new(
                "updater-live",
                "Cierra la pantalla de proyección antes de instalar la actualización.",
            ));
        }
        let _operation = self.0.operation.lock().await;
        let active_output = self
            .0
            .app
            .try_state::<Arc<Core>>()
            .and_then(|core| core.snapshot().ok())
            .is_none_or(|snapshot| {
                snapshot.output.connected || snapshot.output.preparing.is_some()
            });
        installation_permitted(&self.snapshot(), active_output)?;
        let update = self
            .0
            .available
            .lock()
            .clone()
            .ok_or_else(|| Error::message("No hay una actualización preparada."))?;
        let bytes = self
            .0
            .bytes
            .lock()
            .clone()
            .ok_or_else(|| Error::message("No hay una descarga verificada."))?;
        let result = tokio::task::spawn_blocking(move || update.install(bytes.as_slice()))
            .await
            .map_err(|error| Error::external("updater", error))?;
        if let Err(error) = result {
            self.failed(error);
        }
        Ok(())
    }
}

fn installation_permitted(info: &UpdateInfo, blocked: bool) -> Result<()> {
    if blocked {
        return Err(Error::new(
            "updater-live",
            "Cierra la pantalla de proyección antes de instalar la actualización.",
        ));
    }
    if !info.installable || info.status != "downloaded" {
        return Err(Error::new(
            "updater-state",
            "La actualización aún no está lista para instalar.",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests;

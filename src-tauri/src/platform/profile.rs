use crate::error::{Error, Result};
use std::path::{Path, PathBuf};
use tauri::Manager;

pub struct Paths {
    pub profile: PathBuf,
    pub resources: PathBuf,
    pub tools: PathBuf,
    pub remote: PathBuf,
}

pub fn paths(app: &tauri::AppHandle) -> Result<Paths> {
    let profile = profile_directory(app)?;
    let root = if cfg!(debug_assertions) {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or_else(|| Error::message("No se encontró el proyecto de LUMEN."))?
            .to_path_buf()
    } else {
        app.path().resource_dir()?
    };
    Ok(Paths {
        profile,
        resources: root.join("resources"),
        tools: if cfg!(debug_assertions) {
            root.join("src-tauri/tools")
        } else {
            root.join("tools")
        },
        remote: if cfg!(debug_assertions) {
            root.join("dist/remote")
        } else {
            root.join("remote")
        },
    })
}

fn profile_directory(app: &tauri::AppHandle) -> Result<PathBuf> {
    if let Some(path) = std::env::var_os("LUMEN_DATA_DIR") {
        let path = PathBuf::from(path);
        if !path.is_absolute() {
            return Err(Error::new(
                "profile",
                "LUMEN_DATA_DIR debe ser una ruta absoluta.",
            ));
        }
        return Ok(path);
    }
    let current = app.path().app_data_dir()?;
    if current.join("library.json").exists() {
        return Ok(current);
    }
    if let Some(roaming) = std::env::var_os("APPDATA") {
        let legacy = PathBuf::from(roaming).join("LUMEN");
        if legacy.join("library.json").exists() {
            // Continue using the existing profile; never overwrite it with an empty migration.
            return Ok(legacy);
        }
    }
    Ok(current)
}

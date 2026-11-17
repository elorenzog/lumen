mod dialogs;
mod profile;
mod windows;

pub use dialogs::{PickRequest, pick_files};
pub use profile::paths;
pub use windows::{close_output, create_main, displays, open_output, watch_displays};

use crate::error::{Error, Result};
use tauri_plugin_opener::OpenerExt;

pub fn credit_url(github: &str) -> Result<&'static str> {
    match github {
        "elorenzog" => Ok("https://github.com/elorenzog"),
        "xlCyanz" => Ok("https://github.com/xlCyanz"),
        _ => Err(Error::new("credit", "Perfil de desarrollador desconocido.")),
    }
}

pub fn open_credit(app: &tauri::AppHandle, github: &str) -> Result<()> {
    app.opener()
        .open_url(credit_url(github)?, None::<&str>)
        .map_err(|error| Error::external("network", error))
}

pub fn open_releases(app: &tauri::AppHandle) -> Result<()> {
    app.opener()
        .open_url("https://github.com/elorenzog/lumen/releases", None::<&str>)
        .map_err(|error| Error::external("network", error))
}

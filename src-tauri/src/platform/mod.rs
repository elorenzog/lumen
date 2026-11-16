mod dialogs;
mod profile;
mod windows;

pub use dialogs::{PickRequest, pick_files};
pub use profile::paths;
pub use windows::{close_output, create_main, displays, open_output, watch_displays};

use crate::error::{Error, Result};
use tauri_plugin_opener::OpenerExt;

pub fn open_releases(app: &tauri::AppHandle) -> Result<()> {
    app.opener()
        .open_url("https://github.com/elorenzog/lumen/releases", None::<&str>)
        .map_err(|error| Error::external("network", error))
}

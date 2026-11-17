use crate::error::{Error, Result};
#[cfg(debug_assertions)]
use std::collections::BTreeMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

pub enum PickRequest {
    BibleFiles,
    BibleDirectory,
    Hymns { folder: bool },
    Background { kind: String },
}

pub async fn pick_files(app: &AppHandle, request: PickRequest) -> Result<Vec<PathBuf>> {
    #[cfg(debug_assertions)]
    if let Some(file) = std::env::var_os("LUMEN_E2E_DIALOGS_FILE") {
        let selections: BTreeMap<String, Vec<PathBuf>> =
            serde_json::from_slice(&std::fs::read(file)?)?;
        let key = match &request {
            PickRequest::BibleFiles => "import-bible",
            PickRequest::BibleDirectory => "import-bible-folder",
            PickRequest::Hymns { .. } => "import-hymns",
            PickRequest::Background { .. } => "import-background",
        };
        return Ok(selections.get(key).cloned().unwrap_or_default());
    }
    let mut dialog = app.dialog().file();
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    let directory = matches!(
        &request,
        PickRequest::BibleDirectory | PickRequest::Hymns { folder: true }
    );
    dialog = match request {
        PickRequest::BibleFiles => dialog
            .set_title("Importar una traducción")
            .add_filter("Biblia", &["json", "xml", "usfm", "sfm", "zip"]),
        PickRequest::BibleDirectory => dialog.set_title("Importar carpeta de Biblias JSON"),
        PickRequest::Hymns { .. } => dialog
            .set_title("Importar himnos")
            .add_filter("Himnos", &["mkv"]),
        PickRequest::Background { kind } => {
            if kind == "image" {
                dialog
                    .set_title("Elegir imagen de fondo")
                    .add_filter("Imágenes", &["png", "jpg", "jpeg", "webp"])
            } else {
                dialog
                    .set_title("Elegir video de fondo (sin audio)")
                    .add_filter("Videos", &["mp4", "webm"])
            }
        }
    };
    let (sender, receiver) = tokio::sync::oneshot::channel();
    if directory {
        dialog.pick_folder(move |folder| {
            let _ = sender.send(folder.into_iter().collect::<Vec<_>>());
        });
    } else {
        dialog.pick_files(move |files| {
            let _ = sender.send(files.unwrap_or_default());
        });
    }
    receiver
        .await
        .map_err(|error| Error::external("dialog", error))?
        .into_iter()
        .map(|file| {
            file.into_path()
                .map_err(|error| Error::external("dialog", error))
        })
        .collect()
}

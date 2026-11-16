use super::{Core, ImportState};
use crate::{
    data,
    error::{Error, Result},
    models::Hymn,
    platform::{self, PickRequest},
};
use parking_lot::Mutex;
use serde_json::{Value, json, to_value};
use std::{collections::BTreeSet, path::PathBuf, sync::Arc};

struct Busy<'a>(&'a Mutex<bool>);
impl<'a> Busy<'a> {
    fn enter(flag: &'a Mutex<bool>, code: &str, message: &str) -> Result<Self> {
        let mut active = flag.lock();
        if *active {
            return Err(Error::new(code, message));
        }
        *active = true;
        Ok(Self(flag))
    }
}
impl Drop for Busy<'_> {
    fn drop(&mut self) {
        *self.0.lock() = false;
    }
}
struct ImportSession<'a>(&'a Mutex<ImportState>);
impl<'a> ImportSession<'a> {
    fn enter(state: &'a Mutex<ImportState>) -> Result<Self> {
        let mut guard = state.lock();
        if guard.active {
            return Err(Error::new(
                "import-busy",
                "Ya hay una importación de himnos en curso.",
            ));
        }
        guard.active = true;
        guard.removed.clear();
        Ok(Self(state))
    }
}
impl Drop for ImportSession<'_> {
    fn drop(&mut self) {
        let mut state = self.0.lock();
        state.active = false;
        state.removed.clear();
    }
}
impl Core {
    pub(super) async fn download_bible(self: &Arc<Self>, id: &str) -> Result<Value> {
        let _busy = Busy::enter(
            &self.downloading,
            "download-busy",
            "Ya hay una traducción descargándose.",
        )?;
        let bible = data::catalog::download_bible(id, |message| self.status(message)).await?;
        let id = bible.id.clone();
        let name = bible.name.clone();
        let core = Arc::clone(self);
        tokio::task::spawn_blocking(move || core.store.lock().add_bible(bible))
            .await
            .map_err(|error| Error::external("download", error))??;
        self.broadcast();
        self.status(&format!("{name} instalada para uso sin conexión."));
        Ok(Value::String(id))
    }
    pub(super) async fn import_bible(self: &Arc<Self>) -> Result<Value> {
        let files = platform::pick_files(&self.app, PickRequest::BibleFiles).await?;
        if files.is_empty() {
            return Ok(Value::Null);
        }
        let core = Arc::clone(self);
        let id = tokio::task::spawn_blocking(move || -> Result<String> {
            let bible = data::imports::import_bible_files(&files)?;
            let id = bible.id.clone();
            core.store.lock().add_bible(bible)?;
            Ok(id)
        })
        .await
        .map_err(|error| Error::external("import", error))??;
        self.broadcast();
        Ok(Value::String(id))
    }
    pub(super) async fn import_bible_folder(self: &Arc<Self>) -> Result<Value> {
        let _busy = Busy::enter(
            &self.importing_bibles,
            "bible-folder",
            "Ya se está importando una carpeta de Biblias.",
        )?;
        let files = platform::pick_files(&self.app, PickRequest::BibleDirectory).await?;
        let Some(directory) = files.into_iter().next() else {
            return Ok(Value::Null);
        };
        let core = Arc::clone(self);
        let outcome = tokio::task::spawn_blocking(move || {
            data::imports::import_bible_directory(&directory, &mut core.store.lock(), |message| {
                core.status(message)
            })
        })
        .await
        .map_err(|error| Error::external("import", error))??;
        self.broadcast();
        self.status(&format!(
            "{} Biblias importadas; {} ya estaban instaladas.{}",
            outcome.imported,
            outcome.skipped,
            if outcome.errors.is_empty() {
                String::new()
            } else {
                format!(" {} archivo(s) omitido(s).", outcome.errors.len())
            }
        ));
        Ok(to_value(outcome)?)
    }
    pub(super) async fn import_hymns(
        self: &Arc<Self>,
        folder: bool,
        edition: &str,
    ) -> Result<Value> {
        let _session = ImportSession::enter(&self.importing)?;
        let selection = platform::pick_files(&self.app, PickRequest::Hymns { folder }).await?;
        if selection.is_empty() {
            return Ok(Value::Null);
        }
        let files = if folder {
            let directory = selection[0].clone();
            tokio::task::spawn_blocking(move || hymn_files(directory))
                .await
                .map_err(|error| Error::external("import", error))??
        } else {
            selection
        };
        let mut incoming: Vec<Hymn> = Vec::new();
        let mut errors = Vec::new();
        for file in &files {
            match self.media.inspect_hymn(file).await {
                Ok(mut hymn) => {
                    hymn.metadata.edition = edition.into();
                    incoming.push(hymn);
                    self.status(&format!(
                        "Analizando himnos · {}/{}",
                        incoming.len(),
                        files.len()
                    ));
                }
                Err(error) => errors.push(format!(
                    "{}: {}",
                    file.file_name().unwrap_or_default().to_string_lossy(),
                    error.message
                )),
            }
        }
        let imported = {
            let importing = self.importing.lock();
            let removed: BTreeSet<_> = importing.removed.iter().cloned().collect();
            let imported = incoming
                .iter()
                .filter(|hymn| !removed.contains(&hymn.id))
                .count();
            let mut store = self.store.lock();
            let hymns = data::hymns::merge_imported_hymns(&store.saved.hymns, &incoming, &removed);
            let mut saved = store.saved.clone();
            saved.hymns = store.annotate_hymns(&hymns);
            store.save(saved)?;
            imported
        };
        self.broadcast();
        self.status(&format!(
            "{imported} himno(s) importado(s).{}",
            if errors.is_empty() {
                String::new()
            } else {
                format!(" {} archivo(s) omitido(s).", errors.len())
            }
        ));
        Ok(json!({"imported": imported, "errors": errors}))
    }
}
fn hymn_files(directory: PathBuf) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    for entry in std::fs::read_dir(directory)? {
        let entry = entry?;
        if entry.file_type()?.is_file()
            && entry
                .path()
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("mkv"))
        {
            files.push(entry.path());
        }
    }
    files.sort();
    Ok(files)
}

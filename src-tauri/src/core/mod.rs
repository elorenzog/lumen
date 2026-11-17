mod actions;
mod imports;
mod playback;
mod projection;
mod remote_adapter;
mod remote_content;
mod remote_navigation;
#[cfg(test)]
mod tests;

use crate::{
    data::Store,
    error::{Error, Result},
    media::MediaService,
    models::*,
    remote::RemoteService,
    updates::UpdateService,
};
use parking_lot::Mutex;
use playback::Playback;
use serde_json::Value;
use std::{
    collections::HashSet,
    sync::{Arc, Weak},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};

pub struct Core {
    pub app: AppHandle,
    pub store: Mutex<Store>,
    pub media: MediaService,
    pub updates: UpdateService,
    remote: Mutex<Option<Arc<RemoteService>>>,
    output: Mutex<Output>,
    playback: Mutex<Playback>,
    importing: Mutex<ImportState>,
    downloading: Mutex<bool>,
    importing_bibles: Mutex<bool>,
    opening: tokio::sync::Mutex<()>,
    remote_generation: Mutex<u64>,
}
#[derive(Default)]
struct ImportState {
    active: bool,
    removed: HashSet<String>,
}
pub fn now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |d| d.as_secs_f64() * 1000.0)
}
impl Core {
    pub fn new(
        app: AppHandle,
        store: Store,
        media: MediaService,
        updates: UpdateService,
    ) -> Arc<Self> {
        Arc::new(Self {
            app,
            store: Mutex::new(store),
            media,
            updates,
            remote: Mutex::new(None),
            output: Mutex::new(Output::default()),
            playback: Mutex::new(Playback::default()),
            importing: Mutex::new(ImportState::default()),
            downloading: Mutex::new(false),
            importing_bibles: Mutex::new(false),
            opening: tokio::sync::Mutex::new(()),
            remote_generation: Mutex::new(0),
        })
    }
    pub fn attach_remote(self: &Arc<Self>, directory: std::path::PathBuf) {
        let weak: Weak<Self> = Arc::downgrade(self);
        let changed = Arc::new(move || {
            if let Some(core) = weak.upgrade() {
                core.broadcast();
            }
        });
        let adapter = Arc::new(remote_adapter::CoreRemote(Arc::downgrade(self)));
        *self.remote.lock() = Some(Arc::new(RemoteService::new(directory, adapter, changed)));
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        let (saved, old_hymn_catalog, bibles, directory) = {
            let store = self.store.lock();
            (
                store.saved.clone(),
                store.old_hymn_catalog.clone(),
                store.infos()?,
                store.directory.clone(),
            )
        };
        let mut background_media = Vec::with_capacity(saved.backgrounds.len());
        for asset in &saved.backgrounds {
            background_media.push(BackgroundMedia {
                id: asset.id.clone(),
                name: asset.name.clone(),
                kind: asset.kind.clone(),
                url: self
                    .media
                    .register(&directory.join("backgrounds").join(&asset.file))?,
            });
        }
        let remote = self
            .remote
            .lock()
            .clone()
            .map_or_else(Default::default, |service| service.info());
        Ok(Snapshot {
            startup: crate::platform::startup::info(),
            saved,
            updates: self.updates.snapshot(),
            remote,
            old_hymn_catalog,
            output: self.output.lock().clone(),
            displays: crate::platform::displays(&self.app)?,
            bibles,
            background_media,
        })
    }
    pub fn broadcast(&self) {
        match self.snapshot() {
            Ok(snapshot) => {
                let result = self
                    .app
                    .emit_to("main", "lumen:snapshot", &snapshot)
                    .and_then(|()| self.app.emit_to("projection", "lumen:snapshot", &snapshot));
                if let Err(error) = result {
                    eprintln!("lumen.snapshot.emit: {error}");
                }
            }
            Err(error) => eprintln!("lumen.snapshot.failed: {error}"),
        }
    }
    pub fn status(&self, message: &str) {
        if let Err(error) = self.app.emit_to("main", "lumen:status", message) {
            eprintln!("lumen.status.emit: {error}");
        }
    }
    pub fn shutdown(&self) {
        self.stop();
        let remote = self.remote.lock().clone();
        if let Some(remote) = remote {
            remote.close();
        }
        self.media.shutdown();
    }
    fn save(&self, mutate: impl FnOnce(&mut Saved)) -> Result<()> {
        let mut store = self.store.lock();
        let mut saved = store.saved.clone();
        mutate(&mut saved);
        store.save(saved)
    }
    fn history(&self, slide: &Slide) -> Result<()> {
        match slide {
            Slide::Welcome { .. } => return Ok(()),
            Slide::Hymn { .. } | Slide::Verse { .. } => {}
        }
        let title = slide.title();
        self.save(|saved| {
            saved.history.retain(|item| item.title != title);
            saved.history.insert(
                0,
                History {
                    id: uuid::Uuid::new_v4().to_string(),
                    title,
                    slide: slide.redacted(),
                    projected_at: now(),
                    extra: Default::default(),
                },
            );
            saved.history.truncate(30);
        })?;
        self.broadcast();
        Ok(())
    }
    pub async fn action(self: &Arc<Self>, action: Action, source: &str) -> Result<Value> {
        action.authorize(source)?;
        action.validate()?;
        self.dispatch(action).await
    }
    fn hymn(&self, id: &str) -> Result<Hymn> {
        self.store
            .lock()
            .saved
            .hymns
            .iter()
            .find(|h| h.id == id)
            .cloned()
            .ok_or_else(|| Error::new("hymn", "Himno no encontrado."))
    }
    fn changed_output(&self, mutate: impl FnOnce(&mut Output)) {
        mutate(&mut self.output.lock());
        self.broadcast();
    }
}

use super::{Core, now};
use crate::{
    data,
    error::{Error, Result},
    models::*,
    platform,
};
use serde_json::{Value, to_value};
use std::sync::Arc;

impl Core {
    pub(super) async fn dispatch(self: &Arc<Self>, action: Action) -> Result<Value> {
        match action {
            Action::Snapshot => to_value(self.snapshot()?).map_err(Into::into),
            Action::Bible { id } => {
                let bible = self
                    .store
                    .lock()
                    .bible(&id)?
                    .ok_or_else(|| Error::new("bible", "Biblia no encontrada."))?;
                Ok(to_value(bible)?)
            }
            Action::BibleSearch { id, query } => {
                Ok(to_value(self.store.lock().search(&id, &query)?)?)
            }
            Action::BibleCatalog => Ok(to_value(data::catalog::catalog().await?)?),
            Action::DownloadBible { id } => self.download_bible(&id).await,
            Action::ImportBible => self.import_bible().await,
            Action::ImportBibleFolder => self.import_bible_folder().await,
            Action::ImportHymns { folder, edition } => self.import_hymns(folder, &edition).await,
            Action::ImportBackground { kind } => {
                let directory = {
                    let store = self.store.lock();
                    if store.saved.backgrounds.len() >= 200 {
                        return Err(Error::new(
                            "background-limit",
                            "Se ha alcanzado el máximo de 200 fondos.",
                        ));
                    }
                    store.directory.clone()
                };
                let files = platform::pick_files(
                    &self.app,
                    platform::PickRequest::Background { kind: kind.clone() },
                )
                .await?;
                let Some(source) = files.first() else {
                    return Ok(Value::Null);
                };
                let asset = self
                    .media
                    .import_background(source, &directory, &kind)
                    .await?;
                let id = asset.id.clone();
                self.save(|saved| saved.backgrounds.push(asset))?;
                self.broadcast();
                Ok(Value::String(id))
            }
            Action::HymnMetadata { id, metadata } => {
                let hymn = self.hymn(&id)?;
                let mapped = [metadata.sung_track, metadata.instrumental_track];
                if mapped.iter().flatten().any(|track| {
                    !hymn
                        .tracks
                        .iter()
                        .any(|candidate| candidate.index == *track)
                }) || metadata.sung_track.is_some()
                    && metadata.sung_track == metadata.instrumental_track
                {
                    return Err(Error::new(
                        "track-mapping",
                        "Asigna pistas de audio existentes y diferentes para cantado e instrumental.",
                    ));
                }
                self.save(|saved| {
                    if let Some(hymn) = saved.hymns.iter_mut().find(|hymn| hymn.id == id) {
                        hymn.metadata = metadata;
                    }
                })?;
                self.broadcast();
                Ok(Value::Null)
            }
            Action::RemoveHymn { id } => {
                let active = self.playback.lock().has(&id)
                    || matches!(&self.output().slide, Slide::Hymn { hymn_id, .. } if hymn_id == &id);
                if active {
                    self.stop();
                }
                {
                    let mut importing = self.importing.lock();
                    if importing.active {
                        importing.removed.insert(id.clone());
                    }
                }
                self.save(|saved| saved.hymns.retain(|hymn| hymn.id != id))?;
                self.broadcast();
                Ok(Value::Null)
            }
            Action::OpenOutput { display_id } => {
                self.open(display_id).await?;
                Ok(Value::Null)
            }
            Action::CloseOutput => {
                self.stop();
                platform::close_output(&self.app)?;
                self.changed_output(|output| {
                    output.connected = false;
                    output.display_id = None;
                });
                Ok(Value::Null)
            }
            Action::Project { slide } => {
                self.project(slide)?;
                Ok(Value::Null)
            }
            Action::PlayHymn { id, track } => {
                self.play(self.hymn(&id)?, track).await?;
                Ok(Value::Null)
            }
            Action::StopHymn => {
                self.stop();
                Ok(Value::Null)
            }
            Action::Playback {
                playing,
                position,
                ended,
                revision,
            } => {
                self.playback_event(super::playback::Feedback {
                    playing,
                    position,
                    ended: ended.unwrap_or(false),
                    revision,
                });
                Ok(Value::Null)
            }
            Action::Blackout { value } => {
                self.changed_output(|output| {
                    output.position = output.position_at(now());
                    output.blackout = value;
                    output.updated_at = now();
                });
                Ok(Value::Null)
            }
            Action::MediaError { message, revision } => {
                if self.stop_current(Some(revision)) {
                    self.status(&format!("Error de reproducción: {message}"));
                }
                Ok(Value::Null)
            }
            Action::BackgroundError { message } => {
                self.status(&message);
                Ok(Value::Null)
            }
            Action::Settings { settings } => {
                if settings.base_screen.image_id.as_ref().is_some_and(|id| {
                    !self
                        .store
                        .lock()
                        .saved
                        .backgrounds
                        .iter()
                        .any(|asset| &asset.id == id && asset.kind == "image")
                }) {
                    return Err(Error::new(
                        "base-image",
                        "La imagen de la pantalla base no está disponible.",
                    ));
                }
                self.save(|saved| saved.settings = *settings)?;
                self.broadcast();
                Ok(Value::Null)
            }
            Action::Program { program } => {
                self.save(|saved| saved.program = program)?;
                self.broadcast();
                Ok(Value::Null)
            }
            Action::UpdatePreference { check_at_startup } => {
                self.updates.preference(check_at_startup).await?;
                Ok(Value::Null)
            }
            Action::Updates { operation } => {
                match operation {
                    UpdateOperation::Releases => {
                        platform::open_releases(&self.app)?;
                        return Ok(Value::Null);
                    }
                    UpdateOperation::Check => self.updates.check().await?,
                    UpdateOperation::Download => self.updates.download().await?,
                    UpdateOperation::Install => {
                        let output = self.output();
                        self.updates
                            .install(output.connected || output.preparing.is_some())
                            .await?;
                    }
                }
                Ok(to_value(self.updates.snapshot())?)
            }
            Action::RemoteControl { operation } => {
                let remote = self
                    .remote
                    .lock()
                    .clone()
                    .ok_or_else(|| Error::new("remote", "Control remoto no disponible."))?;
                let info = match operation {
                    RemoteOperation::Enable => remote.start().await?,
                    RemoteOperation::Rotate => remote.rotate(),
                    RemoteOperation::Disable => {
                        remote.close();
                        remote.info()
                    }
                };
                Ok(to_value(info)?)
            }
        }
    }
}

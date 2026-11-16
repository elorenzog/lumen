use super::{Core, remote_content};
use crate::{
    error::{Error, Result},
    models::{Action, Slide, Verse},
    remote::*,
};
use std::sync::{Arc, Weak};

pub(super) struct CoreRemote(pub Weak<Core>);
impl CoreRemote {
    fn core(&self) -> Result<Arc<Core>> {
        self.0
            .upgrade()
            .ok_or_else(|| Error::new("remote", "LUMEN se está cerrando."))
    }
}
impl RemoteAdapter for CoreRemote {
    fn state(&self) -> RemoteFuture<'_, RemoteState> {
        Box::pin(async move { self.core()?.remote_state() })
    }
    fn library(&self) -> RemoteFuture<'_, RemoteLibrary> {
        Box::pin(async move {
            let core = self.core()?;
            let store = core.store.lock();
            Ok(remote_content::library(
                &store.saved.hymns,
                &store.old_hymn_catalog,
            ))
        })
    }
    fn search(&self, input: RemoteSearch) -> RemoteFuture<'_, Vec<Verse>> {
        Box::pin(async move {
            let core = self.core()?;
            let store = core.store.lock();
            if !store.has_bible(&input.bible_id)? {
                return Err(Error::new("bible", "La traducción no está disponible."));
            }
            store.search(&input.bible_id, &input.query)
        })
    }
    fn command(&self, input: RemoteCommand) -> RemoteFuture<'_, RemoteState> {
        Box::pin(async move {
            let core = self.core()?;
            // Accepted desktop commands must survive their HTTP connection closing.
            tokio::spawn(async move { core.remote_command(input).await })
                .await
                .map_err(|error| Error::external("remote", error))?
        })
    }
}
#[derive(Clone, Copy)]
struct Intent {
    generation: u64,
    revision: u64,
}
impl Core {
    fn remote_state(&self) -> Result<RemoteState> {
        let snapshot = self.snapshot()?;
        Ok(RemoteState {
            output: snapshot.output,
            volume: snapshot.saved.settings.volume,
            bibles: snapshot
                .bibles
                .into_iter()
                .map(|bible| RemoteBible {
                    id: bible.id,
                    name: bible.name,
                    abbreviation: bible.abbreviation,
                })
                .collect(),
            displays: snapshot.displays,
            program: snapshot
                .saved
                .program
                .into_iter()
                .map(|item| RemoteProgram {
                    id: item.id,
                    title: item.title,
                    kind: match item.slide {
                        Slide::Welcome { .. } => RemoteSlideKind::Welcome,
                        Slide::Verse { .. } => RemoteSlideKind::Verse,
                        Slide::Hymn { .. } => RemoteSlideKind::Hymn,
                    },
                })
                .collect(),
        }
        .redact())
    }
    async fn ready(self: &Arc<Self>, intent: Intent) -> Result<bool> {
        if !self.output().connected {
            let displays = crate::platform::displays(&self.app)?;
            let display = displays
                .iter()
                .find(|display| !display.primary)
                .or_else(|| displays.first())
                .ok_or_else(|| Error::new("display", "No hay una pantalla disponible."))?;
            self.open(display.id).await?;
        }
        let output = self.output();
        Ok(intent.generation == *self.remote_generation.lock()
            && intent.revision == output.revision
            && output.connected)
    }
    async fn remote_project(self: &Arc<Self>, slide: Slide, intent: Intent) -> Result<()> {
        if !self.ready(intent).await? {
            return Ok(());
        }
        match slide {
            Slide::Hymn { hymn_id, track, .. } => self.play(self.hymn(&hymn_id)?, track).await,
            Slide::Verse { .. } | Slide::Welcome { .. } => self.project(slide),
        }
    }
    async fn remote_command(self: &Arc<Self>, command: RemoteCommand) -> Result<RemoteState> {
        let generation = {
            let mut generation = self.remote_generation.lock();
            match &command {
                RemoteCommand::Reference { .. }
                | RemoteCommand::Step { .. }
                | RemoteCommand::Hymn { .. }
                | RemoteCommand::Program { .. }
                | RemoteCommand::Welcome { .. }
                | RemoteCommand::Stop { .. }
                | RemoteCommand::Close { .. } => *generation = generation.wrapping_add(1),
                RemoteCommand::Playback { .. }
                | RemoteCommand::Blackout { .. }
                | RemoteCommand::Volume { .. }
                | RemoteCommand::Open { .. } => {}
            }
            *generation
        };
        let intent = Intent {
            generation,
            revision: self.output().revision,
        };
        match command {
            RemoteCommand::Reference {
                bible_id,
                book,
                chapter,
                range,
            } => {
                let bible = self
                    .store
                    .lock()
                    .bible(&bible_id)?
                    .ok_or_else(|| Error::new("bible", "La traducción no está disponible."))?;
                let verses: Vec<_> = bible
                    .verses
                    .into_iter()
                    .filter(|verse| verse.book == book && verse.chapter == chapter)
                    .collect();
                let selected = remote_content::select_range(&verses, &range)?;
                self.remote_project(
                    remote_content::passage(&selected, &bible.abbreviation)?,
                    intent,
                )
                .await?;
            }
            RemoteCommand::Step { direction } => {
                let slide = self.step(direction)?;
                self.remote_project(slide, intent).await?;
            }
            RemoteCommand::Hymn { id, track } => {
                let hymn = self.hymn(&id)?;
                if !hymn.tracks.iter().any(|candidate| candidate.index == track) {
                    return Err(Error::new(
                        "hymn",
                        "Esta canción o pista no está disponible.",
                    ));
                }
                if self.ready(intent).await? {
                    self.play(hymn, track).await?;
                }
            }
            RemoteCommand::Program { id } => {
                let slide = self
                    .store
                    .lock()
                    .saved
                    .program
                    .iter()
                    .find(|item| item.id == id)
                    .map(|item| item.slide.clone())
                    .ok_or_else(|| {
                        Error::new("program", "El elemento ya no está en el programa.")
                    })?;
                self.remote_project(slide, intent).await?;
            }
            RemoteCommand::Playback { playing, position } => {
                self.action(
                    Action::Playback {
                        playing,
                        position,
                        ended: None,
                        revision: None,
                    },
                    "remote",
                )
                .await?;
            }
            RemoteCommand::Stop { .. } => self.stop(),
            RemoteCommand::Blackout { value } => {
                self.action(Action::Blackout { value }, "remote").await?;
            }
            RemoteCommand::Volume { value } => {
                let mut settings = self.store.lock().saved.settings.clone();
                settings.volume = value;
                self.action(
                    Action::Settings {
                        settings: Box::new(settings),
                    },
                    "remote",
                )
                .await?;
            }
            RemoteCommand::Welcome { .. } => self.remote_project(Slide::welcome(), intent).await?,
            RemoteCommand::Open { display_id } => self.open(display_id).await?,
            RemoteCommand::Close { .. } => {
                self.action(Action::CloseOutput, "remote").await?;
            }
        }
        self.remote_state()
    }
}

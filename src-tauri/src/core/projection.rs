use super::{Core, now};
use crate::{
    error::{Error, Result},
    models::{Hymn, Output, Preparation, Slide},
};
use std::{sync::Arc, time::Duration};
use tauri::Manager;

impl Core {
    pub fn output(&self) -> Output {
        self.output.lock().clone()
    }
    pub async fn open(self: &Arc<Self>, display_id: i64) -> Result<()> {
        let _opening = self.opening.lock().await;
        crate::platform::open_output(&self.app, display_id).await?;
        self.changed_output(|output| {
            if !output.connected {
                output.cleared = false;
            }
            output.connected = true;
            output.display_id = Some(display_id);
        });
        Ok(())
    }
    pub(crate) async fn close(&self) -> Result<()> {
        let _opening = self.opening.lock().await;
        let output = self.output();
        if self.app.get_webview_window("projection").is_none() {
            return Ok(());
        }
        if output.connected {
            self.clear_output(None, true);
            if !output.blackout {
                // Give the renderer a bounded window for the 160 ms fade.
                tokio::time::sleep(Duration::from_millis(240)).await;
            }
        }
        crate::platform::close_output(&self.app)?;
        let closed = tokio::time::timeout(Duration::from_secs(1), async {
            while self.app.get_webview_window("projection").is_some() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await;
        closed.map_err(|_| Error::new("display", "No se pudo cerrar la proyección."))
    }
    pub fn output_closed(&self) {
        if self.output().connected {
            self.clear_output(None, true);
        }
    }
    pub fn stop(&self) {
        self.stop_current(None);
    }
    pub(super) fn stop_current(&self, revision: Option<u64>) -> bool {
        self.clear_output(revision, false)
    }
    fn clear_output(&self, revision: Option<u64>, disconnect: bool) -> bool {
        {
            let mut playback = self.playback.lock();
            let mut output = self.output.lock();
            if revision.is_some_and(|revision| output.revision != revision) {
                return false;
            }
            playback.cancel();
            self.revoke(&output.slide);
            output.slide = Slide::welcome();
            output.cleared = true;
            if disconnect {
                output.connected = false;
                output.display_id = None;
            }
            output.preparing = None;
            output.playing = false;
            output.position = 0.0;
            output.updated_at = now();
            output.revision = output.revision.wrapping_add(1);
        }
        self.broadcast();
        true
    }
    pub(super) fn revoke(&self, slide: &Slide) {
        match slide {
            Slide::Hymn { media_url, .. } => self.media.revoke(media_url),
            Slide::Verse { .. } | Slide::Welcome { .. } => {}
        }
    }
    pub(super) fn project(&self, slide: Slide) -> Result<()> {
        if matches!(slide, Slide::Hymn { .. }) {
            return Err(Error::new(
                "media",
                "Inicia los himnos desde la biblioteca.",
            ));
        }
        {
            let mut playback = self.playback.lock();
            playback.cancel();
            let mut output = self.output.lock();
            self.revoke(&output.slide);
            output.slide = slide.clone();
            output.cleared = false;
            output.preparing = None;
            output.blackout = false;
            output.playing = false;
            output.position = 0.0;
            output.updated_at = now();
            output.revision = output.revision.wrapping_add(1);
        }
        self.broadcast();
        self.history(&slide)
    }
    pub(super) async fn play(self: &Arc<Self>, hymn: Hymn, track: u32) -> Result<()> {
        if !hymn.tracks.iter().any(|candidate| candidate.index == track) {
            return Err(Error::new("track", "Esta pista de audio no existe."));
        }
        let job = {
            let mut playback = self.playback.lock();
            let mut output = self.output.lock();
            if !output.connected {
                return Err(Error::new(
                    "output",
                    "Abre la pantalla de proyección antes de reproducir.",
                ));
            }
            let previous = match &output.slide {
                Slide::Hymn { hymn_id, .. } if hymn_id == &hymn.id => output.position_at(now()),
                Slide::Hymn { .. } | Slide::Verse { .. } | Slide::Welcome { .. } => {
                    playback.pending_position(&hymn.id).unwrap_or_default()
                }
            };
            let position = if previous < hymn.duration - 0.1 {
                previous
            } else {
                0.0
            };
            let job = playback.begin(&hymn.id, position);
            self.revoke(&output.slide);
            output.slide = Slide::welcome();
            output.cleared = false;
            output.preparing = Some(Preparation {
                hymn_id: hymn.id.clone(),
                title: format!("{} · {}", hymn.number, hymn.title),
                track,
            });
            output.playing = false;
            output.position = 0.0;
            output.updated_at = now();
            output.revision = output.revision.wrapping_add(1);
            job
        };
        self.broadcast();
        let weak = Arc::downgrade(self);
        let status = Arc::new(move |message: String| {
            if let Some(core) = weak.upgrade() {
                core.status(&message);
            }
        });
        let prepared = self
            .media
            .prepare_hymn(&hymn, track, job.token.clone(), status)
            .await;
        let slide = {
            let mut playback = self.playback.lock();
            if !playback.is_current(&job) {
                return Ok(());
            }
            let mut output = self.output.lock();
            if !output.connected {
                playback.complete(&job);
                return Ok(());
            }
            let file = match prepared {
                Ok(file) => file,
                Err(error) => {
                    playback.complete(&job);
                    output.preparing = None;
                    output.playing = false;
                    drop(output);
                    drop(playback);
                    self.broadcast();
                    return if error.is_cancelled() {
                        Ok(())
                    } else {
                        Err(error)
                    };
                }
            };
            let url = match self.media.register(&file) {
                Ok(url) => url,
                Err(error) => {
                    playback.complete(&job);
                    output.preparing = None;
                    drop(output);
                    drop(playback);
                    self.broadcast();
                    return Err(error);
                }
            };
            let slide = Slide::Hymn {
                hymn_id: hymn.id,
                title: format!("{} · {}", hymn.number, hymn.title),
                track,
                media_url: url,
            };
            playback.complete(&job);
            output.slide = slide.clone();
            output.preparing = None;
            output.blackout = false;
            output.playing = true;
            output.position = job.position;
            output.updated_at = now();
            output.revision = output.revision.wrapping_add(1);
            slide
        };
        self.broadcast();
        self.history(&slide)?;
        if self.playback.lock().is_current(&job) {
            self.status("Himno listo.");
        }
        Ok(())
    }
    pub(super) fn playback_event(&self, feedback: super::playback::Feedback) {
        let super::playback::Feedback {
            playing,
            position,
            ended,
            revision,
        } = feedback;
        let current = self.output();
        if revision.is_some_and(|revision| revision != current.revision) {
            return;
        }
        let hymn_id = match &current.slide {
            Slide::Hymn { hymn_id, .. } => hymn_id,
            Slide::Welcome { .. } | Slide::Verse { .. } => return,
        };
        if ended {
            self.stop_current(Some(current.revision));
            return;
        }
        let duration = self.hymn(hymn_id).map_or(0.0, |hymn| hymn.duration);
        {
            let mut output = self.output.lock();
            if output.revision != current.revision {
                return;
            }
            output.position = position
                .unwrap_or_else(|| output.position_at(now()))
                .min(duration);
            output.playing = output.connected && playing.unwrap_or(output.playing);
            output.updated_at = now();
        }
        self.broadcast();
    }
}

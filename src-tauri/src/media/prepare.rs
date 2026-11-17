use super::{
    MediaService, StatusCallback,
    cache::{self, Completion, TemporaryFiles},
    encoding,
    probe::{self, Stream},
    process::{Progress, active},
};
use crate::{
    data::models::Hymn,
    error::{Error, Result},
};
use parking_lot::Mutex;
use sha2::{Digest, Sha256};
use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

impl MediaService {
    pub(super) async fn prepare(
        &self,
        hymn: &Hymn,
        track: u32,
        token: &CancellationToken,
        status: StatusCallback,
    ) -> Result<PathBuf> {
        active(token)?;
        active(&self.process.shutdown)?;
        if !hymn.tracks.iter().any(|candidate| candidate.index == track) {
            return Err(Error::new("track", "Esta pista de audio no existe."));
        }
        let metadata = tokio::fs::metadata(&hymn.path).await?;
        let key = format!(
            "{}:{}:{}:{track}:v2",
            hymn.id,
            metadata.len(),
            probe::modified_ms(&metadata)?
        );
        let target = self
            .cache
            .join(format!("{:x}.mp4", Sha256::digest(key.as_bytes())));
        tokio::fs::create_dir_all(&self.cache).await?;
        let lock = self.publication_lock(&target);
        {
            let _publication = cache::acquire(&lock, token).await?;
            if cache::cached(&target).await? {
                active(token)?;
                return Ok(target);
            }
        }
        let info = self.probe(Path::new(&hymn.path), token).await?;
        let video = info
            .streams
            .iter()
            .find(|stream| stream.codec_type == "video");
        let audio = info
            .streams
            .iter()
            .find(|stream| stream.codec_type == "audio" && stream.index == track);
        let (Some(video), Some(audio)) = (video, audio) else {
            return Err(Error::new(
                "track",
                "El vídeo o la pista seleccionada ya no están disponibles en el archivo.",
            ));
        };
        let options = encoding::options(video, audio);
        let temporary = cache::suffix(&target, &format!(".{}.tmp", Uuid::new_v4()));
        let completion = cache::suffix(&temporary, ".json");
        let _cleanup = TemporaryFiles(vec![temporary.clone(), completion.clone()]);
        status(format!("Preparando {} · {}…", hymn.number, hymn.title));
        let progress = progress(hymn, token, Arc::clone(&status));
        let arguments = command(hymn, track, &temporary, &options);
        if let Err(error) = self
            .process
            .run(&self.ffmpeg, &arguments, token, Some(Arc::clone(&progress)))
            .await
        {
            active(token)?;
            if error.is_cancelled() || error.code != "media" || options.get(1) != Some(&"copy") {
                return Err(error);
            }
            status(format!("Adaptando el vídeo del himno {}…", hymn.number));
            let fallback = encoding::options(&Stream::default(), &Stream::default());
            self.process
                .run(
                    &self.ffmpeg,
                    &command(hymn, track, &temporary, &fallback),
                    token,
                    Some(progress),
                )
                .await?;
        }
        active(token)?;
        let prepared = self.probe(&temporary, token).await?;
        if !prepared.streams.iter().any(|stream| {
            stream.codec_type == "video" && stream.codec_name.as_deref() == Some("h264")
        }) || !prepared.streams.iter().any(|stream| {
            stream.codec_type == "audio" && stream.codec_name.as_deref() == Some("aac")
        }) {
            return Err(Error::new(
                "media",
                "La preparación no produjo vídeo y audio compatibles.",
            ));
        }
        let size = tokio::fs::metadata(&temporary).await?.len();
        if size < 12 {
            return Err(Error::new(
                "media",
                "La preparación produjo un archivo incompleto.",
            ));
        }
        active(token)?;
        tokio::fs::write(
            &completion,
            serde_json::to_vec(&Completion { version: 2, size })?,
        )
        .await?;
        active(token)?;
        {
            let _publication = cache::acquire(&lock, token).await?;
            active(token)?;
            if cache::cached(&target).await? {
                active(token)?;
                return Ok(target);
            }
            active(token)?;
            tokio::fs::rename(&temporary, &target).await?;
            active(token)?;
            tokio::fs::rename(&completion, cache::suffix(&target, ".json")).await?;
            active(token)?;
        }
        Ok(target)
    }
}

fn command(hymn: &Hymn, track: u32, target: &Path, encoding: &[&str]) -> Vec<OsString> {
    let mut arguments: Vec<OsString> = ["-hide_banner", "-loglevel", "error", "-y", "-i"]
        .iter()
        .map(OsString::from)
        .collect();
    arguments.push(OsString::from(&hymn.path));
    arguments.extend(
        ["-map", "0:v:0", "-map", &format!("0:{track}"), "-sn", "-dn"]
            .iter()
            .map(OsString::from),
    );
    arguments.extend(encoding.iter().map(OsString::from));
    arguments.extend(
        [
            "-movflags",
            "+faststart",
            "-progress",
            "pipe:1",
            "-nostats",
            "-f",
            "mp4",
        ]
        .iter()
        .map(OsString::from),
    );
    arguments.push(target.as_os_str().to_owned());
    arguments
}

fn progress(hymn: &Hymn, token: &CancellationToken, status: StatusCallback) -> Progress {
    let buffer = Mutex::new((String::new(), -1.0_f64));
    let duration = hymn.duration.max(1.0);
    let number = hymn.number;
    let token = token.clone();
    Arc::new(move |chunk| {
        if token.is_cancelled() {
            return;
        }
        let messages = {
            let mut state = buffer.lock();
            state.0.push_str(chunk);
            let mut messages = Vec::new();
            while let Some(end) = state.0.find('\n') {
                let line: String = state.0.drain(..=end).collect();
                if let Some(time) = line
                    .trim()
                    .strip_prefix("out_time_us=")
                    .and_then(|value| value.parse::<f64>().ok())
                {
                    let percent = (time / 1_000_000.0 / duration * 100.0).round().min(99.0);
                    if percent >= state.1 + 5.0 {
                        state.1 = percent;
                        messages.push(format!("Preparando himno {number} · {percent}%"));
                    }
                }
            }
            messages
        };
        for message in messages {
            if !token.is_cancelled() {
                status(message);
            }
        }
    })
}

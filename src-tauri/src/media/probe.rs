use super::MediaService;
use crate::{
    data::models::{Hymn, HymnMetadata, Track},
    error::{Error, Result},
};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    ffi::OsString,
    path::Path,
    time::{Duration, UNIX_EPOCH},
};
use tokio_util::sync::CancellationToken;

#[derive(Debug, Deserialize)]
pub(super) struct Probe {
    pub format: Format,
    pub streams: Vec<Stream>,
}

#[derive(Debug, Deserialize)]
pub(super) struct Format {
    #[serde(deserialize_with = "duration")]
    pub duration: f64,
}

#[derive(Debug, Default, Deserialize)]
pub(super) struct Stream {
    pub index: u32,
    pub codec_type: String,
    pub codec_name: Option<String>,
    pub pix_fmt: Option<String>,
    pub channels: Option<u32>,
    pub profile: Option<String>,
    #[serde(default)]
    pub tags: Tags,
}

#[derive(Debug, Default, Deserialize)]
pub(super) struct Tags {
    pub title: Option<String>,
    pub language: Option<String>,
}

fn duration<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<f64, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Duration {
        Text(String),
        Number(f64),
    }
    let value = match Duration::deserialize(deserializer)? {
        Duration::Text(value) => value.parse().map_err(serde::de::Error::custom)?,
        Duration::Number(value) => value,
    };
    if !value.is_finite() || value < 0.0 {
        return Err(serde::de::Error::custom("Invalid media duration"));
    }
    Ok(value)
}

impl MediaService {
    pub(super) async fn probe(&self, file: &Path, token: &CancellationToken) -> Result<Probe> {
        let mut arguments: Vec<OsString> = [
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
        ]
        .iter()
        .map(OsString::from)
        .collect();
        arguments.push(file.as_os_str().to_owned());
        Ok(serde_json::from_slice(
            &self
                .process
                .run(&self.ffprobe, &arguments, token, None)
                .await?,
        )?)
    }

    pub async fn inspect_hymn(&self, file: &Path) -> Result<Hymn> {
        let filename = file
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| Error::new("hymn-name", "Nombre de himno no válido."))?;
        let (number, title) = hymn_name(filename).ok_or_else(|| {
            Error::new(
                "hymn-name",
                format!("Nombre no reconocido: {filename}. Usa «001 Nombre del himno.mkv»."),
            )
        })?;
        let metadata = tokio::fs::metadata(file).await?;
        let probe = self.probe(file, &CancellationToken::new()).await?;
        if !probe
            .streams
            .iter()
            .any(|stream| stream.codec_type == "video")
        {
            return Err(Error::new("video", "El MKV no contiene vídeo."));
        }
        let tracks: Vec<Track> = probe
            .streams
            .into_iter()
            .filter(|stream| stream.codec_type == "audio")
            .enumerate()
            .map(|(index, stream)| Track {
                index: stream.index,
                label: stream
                    .tags
                    .title
                    .unwrap_or_else(|| format!("Audio {}", index + 1)),
                language: stream.tags.language.unwrap_or_else(|| "und".into()),
            })
            .collect();
        if tracks.is_empty() {
            return Err(Error::new("audio", "El MKV no contiene pistas de audio."));
        }
        let absolute = std::path::absolute(file)?;
        let id = format!(
            "{:x}",
            Sha256::digest(absolute.to_string_lossy().as_bytes())
        );
        Ok(Hymn {
            id: id[..24].to_owned(),
            number,
            title,
            path: file.to_string_lossy().into_owned(),
            duration: probe.format.duration,
            tracks,
            size: metadata.len(),
            modified: modified_ms(&metadata)?,
            metadata: HymnMetadata::default(),
            extra: Default::default(),
        })
    }
}

pub(super) fn modified_ms(metadata: &std::fs::Metadata) -> Result<f64> {
    let modified = metadata
        .modified()?
        .duration_since(UNIX_EPOCH)
        .map_err(|error| Error::new("media", error.to_string()))?;
    Ok(timestamp_ms(modified))
}

fn timestamp_ms(duration: Duration) -> f64 {
    Duration::from_secs(duration.as_secs()).as_secs_f64() * 1000.0
        + f64::from(duration.subsec_nanos()) / 1_000_000.0
}

fn hymn_name(filename: &str) -> Option<(u32, String)> {
    let extension = filename.get(filename.len().checked_sub(4)?..)?;
    if !extension.eq_ignore_ascii_case(".mkv") {
        return None;
    }
    let stem = filename.get(..filename.len().checked_sub(4)?)?;
    let cleaned = stem.strip_prefix('(').unwrap_or(stem).trim_start();
    let digits: String = cleaned.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() || digits.len() > 4 {
        return None;
    }
    let number: u32 = digits.parse().ok()?;
    if number == 0 {
        return None;
    }
    let remainder = cleaned.get(digits.len()..)?;
    let separator =
        |character: char| character.is_whitespace() || matches!(character, '.' | '-' | '–' | '_');
    if !remainder.starts_with(separator) {
        return None;
    }
    let title = remainder.trim_start_matches(separator);
    let title = title.strip_suffix(')').unwrap_or(title).trim();
    if title.is_empty() {
        return None;
    }
    Some((number, title.to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_timestamps_match_node_milliseconds_without_rounding_seconds_first() {
        assert_eq!(
            timestamp_ms(Duration::new(1_700_000_000, 600)),
            1_700_000_000_000.000_5
        );
    }

    #[test]
    fn hymn_names_preserve_parentheses_four_digit_numbers_and_case_insensitive_extensions() {
        assert_eq!(
            hymn_name("( 1234 - Prueba).MKV"),
            Some((1234, "Prueba".into()))
        );
        assert_eq!(hymn_name("001 Himno.mkv"), Some((1, "Himno".into())));
        assert!(hymn_name("001Himno.mkv").is_none());
        assert!(hymn_name("000 Himno.mkv").is_none());
    }
}

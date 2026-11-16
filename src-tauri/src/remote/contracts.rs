use crate::error::{Error, Result};
use crate::models::{Display, Output, Slide};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub enabled: bool,
    pub urls: Vec<String>,
    pub pin: String,
    pub devices: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RemoteState {
    pub output: Output,
    pub volume: f64,
    pub bibles: Vec<RemoteBible>,
    pub displays: Vec<Display>,
    pub program: Vec<RemoteProgram>,
}
impl RemoteState {
    pub fn redact(mut self) -> Self {
        if let Slide::Hymn { media_url, .. } = &mut self.output.slide {
            media_url.clear();
        }
        self
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RemoteBible {
    pub id: String,
    pub name: String,
    pub abbreviation: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RemoteProgram {
    pub id: String,
    pub title: String,
    pub kind: RemoteSlideKind,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RemoteSlideKind {
    Verse,
    Hymn,
    Welcome,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct RemoteLibrary {
    pub hymns: Vec<RemoteHymn>,
    pub old: Vec<RemoteOldHymn>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteHymn {
    pub id: String,
    pub number: u32,
    pub title: String,
    pub number1962: Option<u32>,
    pub number2009: Option<u32>,
    pub tracks: Vec<RemoteTrack>,
    pub duration: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RemoteTrack {
    pub index: u32,
    pub label: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteOldHymn {
    pub number: u32,
    pub title: String,
    pub hymn_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RemoteSearch {
    pub bible_id: String,
    pub query: String,
}
impl RemoteSearch {
    pub fn validate(self) -> Result<Self> {
        if valid_text(&self.bible_id, 200) && valid_text(&self.query, 500) {
            Ok(self)
        } else {
            Err(invalid())
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "lowercase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum RemoteCommand {
    Reference {
        bible_id: String,
        book: u32,
        chapter: u32,
        range: String,
    },
    Step {
        direction: i8,
    },
    Hymn {
        id: String,
        track: u32,
    },
    Program {
        id: String,
    },
    Playback {
        #[serde(default, deserialize_with = "optional_present")]
        playing: Option<bool>,
        #[serde(default, deserialize_with = "optional_present")]
        position: Option<f64>,
    },
    Stop {},
    Blackout {
        value: bool,
    },
    Volume {
        value: f64,
    },
    Welcome {},
    Open {
        display_id: i64,
    },
    Close {},
}
impl RemoteCommand {
    pub fn validate(self) -> Result<Self> {
        let valid = match &self {
            Self::Reference {
                bible_id,
                book,
                chapter,
                range,
            } => {
                valid_text(bible_id, 200)
                    && (1..=66).contains(book)
                    && (1..=150).contains(chapter)
                    && valid_text(range, 20)
            }
            Self::Step { direction } => [-1, 1].contains(direction),
            Self::Hymn { id, .. } | Self::Program { id } => valid_text(id, 200),
            Self::Playback { position, .. } => {
                position.is_none_or(|v| v.is_finite() && (0.0..=86400.0).contains(&v))
            }
            Self::Volume { value } => value.is_finite() && (0.0..=1.0).contains(value),
            Self::Open { .. }
            | Self::Stop {}
            | Self::Blackout { .. }
            | Self::Welcome {}
            | Self::Close {} => true,
        };
        if valid { Ok(self) } else { Err(invalid()) }
    }
}
fn valid_text(value: &str, maximum: usize) -> bool {
    !value.is_empty() && value.encode_utf16().count() <= maximum
}
fn optional_present<'de, D, T>(deserializer: D) -> std::result::Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    T::deserialize(deserializer).map(Some)
}
fn invalid() -> Error {
    Error::new("remote-input", "Los datos enviados no son válidos.")
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Pair {
    pub pin: String,
}

pub use crate::data::models::{
    BibleInfo, History, Hymn, HymnMetadata, OldHymnCatalogEntry, ProgramItem, Saved, Settings,
    Verse,
};
use crate::remote::RemoteInfo;
use crate::updates::UpdateInfo;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "lowercase",
    rename_all_fields = "camelCase"
)]
pub enum Slide {
    Welcome {
        title: String,
        subtitle: String,
    },
    Verse {
        text: String,
        reference: String,
        translation: String,
    },
    Hymn {
        hymn_id: String,
        title: String,
        track: u32,
        media_url: String,
    },
}
impl Slide {
    pub fn welcome() -> Self {
        Self::Welcome {
            title: "LUMEN".into(),
            subtitle: "La Palabra que ilumina,\nla alabanza que inspira.".into(),
        }
    }
    pub fn title(&self) -> String {
        match self {
            Self::Welcome { title, .. } | Self::Hymn { title, .. } => title.clone(),
            Self::Verse {
                reference,
                translation,
                ..
            } => format!("{reference} · {translation}"),
        }
    }
    pub fn redacted(&self) -> Self {
        match self {
            Self::Hymn {
                hymn_id,
                title,
                track,
                ..
            } => Self::Hymn {
                hymn_id: hymn_id.clone(),
                title: title.clone(),
                track: *track,
                media_url: String::new(),
            },
            Self::Welcome { .. } | Self::Verse { .. } => self.clone(),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preparation {
    pub hymn_id: String,
    pub title: String,
    pub track: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    pub slide: Slide,
    pub blackout: bool,
    pub playing: bool,
    pub position: f64,
    pub updated_at: f64,
    pub connected: bool,
    pub display_id: Option<i64>,
    pub revision: u64,
    pub preparing: Option<Preparation>,
}
impl Default for Output {
    fn default() -> Self {
        Self {
            slide: Slide::welcome(),
            blackout: false,
            playing: false,
            position: 0.0,
            updated_at: crate::core::now(),
            connected: false,
            display_id: None,
            revision: 0,
            preparing: None,
        }
    }
}
impl Output {
    pub fn position_at(&self, now: f64) -> f64 {
        self.position
            + if self.playing && !self.blackout {
                ((now - self.updated_at) / 1000.0).max(0.0)
            } else {
                0.0
            }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Display {
    pub id: i64,
    pub label: String,
    pub width: u32,
    pub height: u32,
    pub primary: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BackgroundMedia {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub url: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub startup: crate::platform::startup::StartupInfo,
    #[serde(flatten)]
    pub saved: Saved,
    pub updates: UpdateInfo,
    pub remote: RemoteInfo,
    pub old_hymn_catalog: Vec<OldHymnCatalogEntry>,
    pub output: Output,
    pub displays: Vec<Display>,
    pub bibles: Vec<BibleInfo>,
    pub background_media: Vec<BackgroundMedia>,
}

#[path = "core/action_model.rs"]
mod action_model;
pub use action_model::{Action, RemoteOperation, UpdateOperation};

use crate::{
    error::{Error, Result},
    models::{HymnMetadata, ProgramItem, Settings, Slide},
};
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateOperation {
    Check,
    Download,
    Install,
    Releases,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RemoteOperation {
    Enable,
    Disable,
    Rotate,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum Action {
    Updates {
        operation: UpdateOperation,
    },
    UpdatePreference {
        check_at_startup: bool,
    },
    RemoteControl {
        operation: RemoteOperation,
    },
    Snapshot,
    Bible {
        id: String,
    },
    BibleSearch {
        id: String,
        query: String,
    },
    BibleCatalog,
    DownloadBible {
        id: String,
    },
    ImportBible,
    ImportBibleFolder,
    ImportBackground {
        kind: String,
    },
    ImportHymns {
        folder: bool,
        #[serde(default = "unknown_edition")]
        edition: String,
    },
    HymnMetadata {
        id: String,
        metadata: HymnMetadata,
    },
    RemoveHymn {
        id: String,
    },
    OpenOutput {
        display_id: i64,
    },
    CloseOutput,
    Project {
        slide: Slide,
    },
    PlayHymn {
        id: String,
        track: u32,
    },
    StopHymn,
    Playback {
        playing: Option<bool>,
        position: Option<f64>,
        ended: Option<bool>,
        revision: Option<u64>,
    },
    Blackout {
        value: bool,
    },
    MediaError {
        message: String,
        revision: u64,
    },
    BackgroundError {
        message: String,
    },
    Settings {
        settings: Box<Settings>,
    },
    Program {
        program: Vec<ProgramItem>,
    },
}
fn unknown_edition() -> String {
    "unknown".into()
}
impl Action {
    pub fn authorize(&self, source: &str) -> Result<()> {
        match source {
            "main" | "remote" => Ok(()),
            "projection" => match self {
                Self::Snapshot
                | Self::Playback { .. }
                | Self::MediaError { .. }
                | Self::BackgroundError { .. }
                | Self::CloseOutput => Ok(()),
                Self::Updates { .. }
                | Self::UpdatePreference { .. }
                | Self::RemoteControl { .. }
                | Self::Bible { .. }
                | Self::BibleSearch { .. }
                | Self::BibleCatalog
                | Self::DownloadBible { .. }
                | Self::ImportBible
                | Self::ImportBibleFolder
                | Self::ImportBackground { .. }
                | Self::ImportHymns { .. }
                | Self::HymnMetadata { .. }
                | Self::RemoveHymn { .. }
                | Self::OpenOutput { .. }
                | Self::Project { .. }
                | Self::PlayHymn { .. }
                | Self::StopHymn
                | Self::Blackout { .. }
                | Self::Settings { .. }
                | Self::Program { .. } => Err(Error::new(
                    "permission",
                    "Acción no permitida desde la salida.",
                )),
            },
            _ => Err(Error::new("sender", "Origen no permitido.")),
        }
    }
    pub fn validate(&self) -> Result<()> {
        let valid = match self {
            Self::BibleSearch { query, .. } => query.encode_utf16().count() <= 500,
            Self::DownloadBible { id } => matches!(id.as_str(), "spa_bll" | "spa_blm"),
            Self::ImportBackground { kind } => matches!(kind.as_str(), "image" | "video"),
            Self::ImportHymns { edition, .. } => {
                matches!(edition.as_str(), "1962" | "2009" | "unknown")
            }
            Self::Playback { position, .. } => position.is_none_or(|v| v.is_finite() && v >= 0.0),
            Self::MediaError { message, .. } | Self::BackgroundError { message } => {
                message.encode_utf16().count() <= 1000
            }
            Self::Program { program } => program.len() <= 500,
            Self::Project { slide } => match slide {
                Slide::Hymn { .. } => false,
                Slide::Verse { .. } | Slide::Welcome { .. } => true,
            },
            Self::Updates { .. }
            | Self::UpdatePreference { .. }
            | Self::RemoteControl { .. }
            | Self::Snapshot
            | Self::Bible { .. }
            | Self::BibleCatalog
            | Self::ImportBible
            | Self::ImportBibleFolder
            | Self::HymnMetadata { .. }
            | Self::RemoveHymn { .. }
            | Self::OpenOutput { .. }
            | Self::CloseOutput
            | Self::PlayHymn { .. }
            | Self::StopHymn
            | Self::Blackout { .. }
            | Self::Settings { .. } => true,
        };
        if valid {
            Ok(())
        } else {
            Err(Error::new(
                "validation",
                "Los datos no tienen un formato válido.",
            ))
        }
    }
}

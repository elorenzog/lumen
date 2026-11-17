pub use super::appearance::{Appearance, BackgroundAsset, Settings};
use crate::models::Slide;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Verse {
    pub book: u32,
    pub chapter: u32,
    pub verse: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_verse: Option<u32>,
    pub text: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bible {
    pub id: String,
    pub name: String,
    pub abbreviation: String,
    pub source: String,
    pub license: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<Value>,
    pub verses: Vec<Verse>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BibleInfo {
    pub id: String,
    pub name: String,
    pub abbreviation: String,
    pub source: String,
    pub license: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<Value>,
    pub count: u64,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Track {
    pub index: u32,
    pub label: String,
    pub language: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct HymnMetadata {
    pub number1962: Option<u32>,
    pub number2009: Option<u32>,
    pub numbering_source: String,
    pub numbering_conflict: bool,
    pub edition: String,
    pub favorite: bool,
    pub topic: String,
    pub lyrics: String,
    pub lyricist: String,
    pub composer: String,
    pub references: String,
    pub sung_track: Option<u32>,
    pub instrumental_track: Option<u32>,
}
impl Default for HymnMetadata {
    fn default() -> Self {
        Self {
            number1962: None,
            number2009: None,
            numbering_source: String::new(),
            numbering_conflict: false,
            edition: "unknown".into(),
            favorite: false,
            topic: String::new(),
            lyrics: String::new(),
            lyricist: String::new(),
            composer: String::new(),
            references: String::new(),
            sung_track: None,
            instrumental_track: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hymn {
    pub id: String,
    pub number: u32,
    pub title: String,
    pub path: String,
    pub duration: f64,
    pub tracks: Vec<Track>,
    pub size: u64,
    pub modified: f64,
    #[serde(flatten)]
    pub metadata: HymnMetadata,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProgramItem {
    pub id: String,
    pub title: String,
    pub slide: Slide,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    pub id: String,
    pub title: String,
    pub slide: Slide,
    pub projected_at: f64,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OldHymnCatalogEntry {
    pub number: u32,
    pub title: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Saved {
    pub hymns: Vec<Hymn>,
    pub program: Vec<ProgramItem>,
    #[serde(default)]
    pub history: Vec<History>,
    pub settings: Settings,
    #[serde(default)]
    pub backgrounds: Vec<BackgroundAsset>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

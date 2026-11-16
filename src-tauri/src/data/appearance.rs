use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Appearance {
    pub mode: String,
    pub color: String,
    pub secondary: String,
    pub angle: f64,
    pub asset_id: Option<String>,
    pub dim: f64,
    pub text_color: String,
    pub reference_color: String,
    pub font_family: String,
    pub bold: bool,
    pub align: String,
    pub vertical: String,
    pub margin: f64,
    pub line_height: f64,
    pub shadow: f64,
    pub outline: f64,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}
impl Default for Appearance {
    fn default() -> Self {
        Self {
            mode: "preset".into(),
            color: "#111d32".into(),
            secondary: "#736344".into(),
            angle: 135.0,
            asset_id: None,
            dim: 25.0,
            text_color: "#ffffff".into(),
            reference_color: "#c29b55".into(),
            font_family: "georgia".into(),
            bold: false,
            align: "center".into(),
            vertical: "center".into(),
            margin: 9.0,
            line_height: 1.4,
            shadow: 2.0,
            outline: 0.0,
            extra: BTreeMap::new(),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemePreset {
    pub id: String,
    pub name: String,
    pub appearance: Appearance,
    pub font_size: f64,
    pub theme: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct BaseScreen {
    pub image_id: Option<String>,
    pub fit: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}
impl Default for BaseScreen {
    fn default() -> Self {
        Self {
            image_id: None,
            fit: "contain".into(),
            extra: BTreeMap::new(),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub font_size: f64,
    pub auto_project: bool,
    pub volume: f64,
    #[serde(default)]
    pub appearance: Appearance,
    #[serde(default)]
    pub presets: Vec<ThemePreset>,
    #[serde(default)]
    pub base_screen: BaseScreen,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "noche".into(),
            font_size: 52.0,
            auto_project: false,
            volume: 0.8,
            appearance: Appearance::default(),
            presets: Vec::new(),
            base_screen: BaseScreen::default(),
            extra: BTreeMap::new(),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BackgroundAsset {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub file: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

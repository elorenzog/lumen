use super::models::{Appearance, Bible, Hymn, Saved, Settings};
use crate::error::{Error, Result};

fn bounded(value: &str, minimum: usize, maximum: usize) -> bool {
    let count = value.encode_utf16().count();
    (minimum..=maximum).contains(&count)
}
fn valid_enum(value: &str, options: &[&str]) -> bool {
    options.contains(&value)
}
fn between(value: f64, low: f64, high: f64) -> bool {
    value.is_finite() && (low..=high).contains(&value)
}
fn invalid() -> Error {
    Error::new("format", "Los datos no tienen un formato válido.")
}

pub fn bible(value: &Bible) -> Result<()> {
    if value.id.is_empty()
        || !value
            .id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        || !bounded(&value.name, 1, 200)
        || !bounded(&value.abbreviation, 1, 40)
        || !bounded(&value.source, 0, 1000)
        || !bounded(&value.license, 0, 1000)
        || !(1..=50000).contains(&value.verses.len())
    {
        return Err(invalid());
    }
    for verse in &value.verses {
        if !(1..=66).contains(&verse.book)
            || verse.chapter == 0
            || verse.verse == 0
            || verse.end_verse.is_some_and(|end| end == 0)
            || !bounded(&verse.text, 1, 20000)
        {
            return Err(invalid());
        }
    }
    if let Some(provenance) = &value.provenance {
        let object = provenance.as_object().ok_or_else(invalid)?;
        for (key, options) in [
            (
                "provider",
                &["local", "ebible", "fetch-bible", "open-bible", "api-bible"][..],
            ),
            (
                "rights",
                &["public-domain", "open-license", "authorized", "unspecified"][..],
            ),
            ("offline", &["allowed", "unspecified"][..]),
            ("redistribution", &["allowed", "unspecified"][..]),
        ] {
            if object
                .get(key)
                .is_some_and(|v| !v.as_str().is_some_and(|s| valid_enum(s, options)))
            {
                return Err(invalid());
            }
        }
        for (key, maximum) in [
            ("attribution", 4000),
            ("licenseUrl", 1000),
            ("notice", 1000),
        ] {
            if object
                .get(key)
                .is_some_and(|value| !value.as_str().is_some_and(|text| bounded(text, 0, maximum)))
            {
                return Err(invalid());
            }
        }
        if object.get("retrievedAt").is_some_and(|value| {
            !value
                .as_f64()
                .is_some_and(|number| between(number, 0.0, f64::MAX))
        }) {
            return Err(invalid());
        }
    }
    Ok(())
}

pub fn appearance(value: &Appearance) -> Result<()> {
    let color = |s: &str| {
        s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|b| b.is_ascii_hexdigit())
    };
    if !valid_enum(
        &value.mode,
        &["preset", "solid", "gradient", "image", "video"],
    ) || !color(&value.color)
        || !color(&value.secondary)
        || !color(&value.text_color)
        || !color(&value.reference_color)
        || !valid_enum(&value.font_family, &["georgia", "segoe", "arial"])
        || !valid_enum(&value.align, &["left", "center", "right"])
        || !valid_enum(&value.vertical, &["top", "center", "bottom"])
        || !between(value.angle, 0.0, 360.0)
        || !between(value.dim, 0.0, 90.0)
        || !between(value.margin, 4.0, 20.0)
        || !between(value.line_height, 1.0, 2.0)
        || !between(value.shadow, 0.0, 8.0)
        || !between(value.outline, 0.0, 4.0)
        || value
            .asset_id
            .as_ref()
            .is_some_and(|id| uuid::Uuid::parse_str(id).is_err())
    {
        return Err(invalid());
    }
    Ok(())
}

pub fn settings(value: &Settings) -> Result<()> {
    if !valid_enum(&value.theme, &["noche", "amanecer", "negro"])
        || !between(value.font_size, 24.0, 76.0)
        || !between(value.volume, 0.0, 1.0)
        || value.presets.len() > 40
        || !valid_enum(&value.base_screen.fit, &["contain", "cover"])
        || value
            .base_screen
            .loading_position
            .as_ref()
            .is_some_and(|position| position.x > 100 || position.y > 100)
        || value
            .base_screen
            .image_id
            .as_ref()
            .is_some_and(|id| uuid::Uuid::parse_str(id).is_err())
    {
        return Err(invalid());
    }
    appearance(&value.appearance)?;
    for preset in &value.presets {
        if uuid::Uuid::parse_str(&preset.id).is_err()
            || !bounded(preset.name.trim(), 1, 60)
            || !between(preset.font_size, 24.0, 76.0)
            || !valid_enum(&preset.theme, &["noche", "amanecer", "negro"])
        {
            return Err(invalid());
        }
        appearance(&preset.appearance)?;
    }
    Ok(())
}

pub fn hymn(value: &Hymn) -> Result<()> {
    let metadata = &value.metadata;
    if value.number == 0
        || !between(value.duration, 0.0, f64::MAX)
        || value.tracks.is_empty()
        || !value.modified.is_finite()
        || !valid_enum(&metadata.edition, &["1962", "2009", "unknown"])
        || metadata.number1962 == Some(0)
        || metadata.number2009 == Some(0)
        || !bounded(&metadata.numbering_source, 0, 1000)
        || !bounded(&metadata.topic, 0, 1000)
        || !bounded(&metadata.lyrics, 0, 50000)
        || !bounded(&metadata.lyricist, 0, 500)
        || !bounded(&metadata.composer, 0, 500)
        || !bounded(&metadata.references, 0, 2000)
    {
        return Err(invalid());
    }
    Ok(())
}

pub fn saved(value: &Saved) -> Result<()> {
    settings(&value.settings)?;
    if value.history.len() > 30 || value.backgrounds.len() > 200 {
        return Err(invalid());
    }
    for item in &value.hymns {
        hymn(item)?;
    }
    for asset in &value.backgrounds {
        let valid_file = asset
            .file
            .rsplit_once('.')
            .is_some_and(|(stem, extension)| {
                !stem.is_empty()
                    && stem.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
                    && ["png", "mp4", "webm"].contains(&extension)
            });
        if uuid::Uuid::parse_str(&asset.id).is_err()
            || !bounded(&asset.name, 1, 255)
            || !valid_enum(&asset.kind, &["image", "video"])
            || !valid_file
        {
            return Err(invalid());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_screen_loading_position_is_optional_and_validated() -> serde_json::Result<()> {
        let legacy = serde_json::to_value(Settings::default())?;
        let old: Settings = serde_json::from_value(legacy.clone())?;
        assert!(old.base_screen.loading_position.is_none());
        assert!(settings(&old).is_ok());

        let mut configured = legacy;
        configured["baseScreen"]["loadingPosition"] = serde_json::json!({"x": 38, "y": 87});
        let valid: Settings = serde_json::from_value(configured.clone())?;
        assert!(settings(&valid).is_ok());
        assert_eq!(
            serde_json::to_value(valid)?["baseScreen"],
            configured["baseScreen"]
        );

        configured["baseScreen"]["loadingPosition"]["x"] = serde_json::json!(101);
        assert!(settings(&serde_json::from_value(configured)?).is_err());
        Ok(())
    }
}

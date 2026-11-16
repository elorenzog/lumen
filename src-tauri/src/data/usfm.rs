use super::{
    domain::BOOK_CODES,
    models::{Bible, Verse},
    validation,
};
use crate::error::{Error, Result};
use regex::Regex;
use std::collections::BTreeSet;

fn expression(value: &str) -> Result<Regex> {
    Regex::new(value).map_err(|error| Error::external("usfm", error))
}
fn flush(current: &mut Option<Verse>, verses: &mut Vec<Verse>) {
    if let Some(mut verse) = current.take() {
        verse.text = verse.text.split_whitespace().collect::<Vec<_>>().join(" ");
        if !verse.text.is_empty() {
            verses.push(verse);
        }
    }
}
pub fn parse_usfm(content: &str) -> Result<Vec<Verse>> {
    let id_pattern = expression(r"(?m)^\s*\\id\s+([A-Z0-9]+)")?;
    let code = id_pattern
        .captures(content.trim_start_matches('\u{feff}'))
        .and_then(|matched| matched.get(1))
        .map(|matched| matched.as_str())
        .ok_or_else(|| Error::new("usfm-book", "USFM: falta el código de libro."))?;
    let book = BOOK_CODES
        .iter()
        .position(|item| *item == code)
        .and_then(|index| u32::try_from(index + 1).ok())
        .ok_or_else(|| {
            Error::new(
                "usfm-book",
                format!("USFM: código de libro no admitido ({code})."),
            )
        })?;
    let markers = expression(r"\\([+A-Za-z][A-Za-z0-9-]*|\*)(\*)?")?;
    let matches: Vec<_> = markers.captures_iter(content).collect();
    let mut chapter = 0;
    let mut current: Option<Verse> = None;
    let mut verses = Vec::new();
    let mut note: Option<&str> = None;
    let mut omitted = false;
    for (index, matched) in matches.iter().enumerate() {
        let Some(whole) = matched.get(0) else {
            continue;
        };
        let Some(tag) = matched.get(1) else {
            continue;
        };
        let tag = tag.as_str().trim_start_matches('+');
        let closing = matched.get(2).is_some();
        let end = matches
            .get(index + 1)
            .and_then(|next| next.get(0))
            .map_or(content.len(), |next| next.start());
        let segment = &content[whole.end()..end];
        if let Some(active_note) = note {
            if closing && tag == active_note {
                note = None;
            } else {
                continue;
            }
        } else if !closing && ["f", "fe", "x", "fig", "cat"].contains(&tag) {
            note = Some(tag);
            continue;
        }
        if !closing && tag == "c" {
            flush(&mut current, &mut verses);
            chapter = segment
                .split_whitespace()
                .next()
                .ok_or_else(|| Error::new("usfm-chapter", "USFM: capítulo no reconocido."))?
                .parse::<u32>()
                .map_err(|error| Error::external("usfm-chapter", error))?;
            if chapter == 0 {
                return Err(Error::new("usfm-chapter", "USFM: capítulo no reconocido."));
            }
            omitted = false;
            continue;
        }
        if !closing && tag == "v" {
            flush(&mut current, &mut verses);
            if chapter == 0 {
                return Err(Error::new(
                    "usfm-chapter",
                    "USFM: falta el capítulo del versículo.",
                ));
            }
            let trimmed = segment.trim_start();
            let number_end = trimmed.find(char::is_whitespace).unwrap_or(trimmed.len());
            let number = &trimmed[..number_end];
            let mut parts = number.split('-');
            let verse = parts
                .next()
                .ok_or_else(|| Error::new("usfm-verse", "USFM: falta el versículo."))?
                .parse::<u32>()
                .map_err(|error| Error::external("usfm-verse", error))?;
            let end_verse = parts
                .next()
                .map(str::parse::<u32>)
                .transpose()
                .map_err(|error| Error::external("usfm-verse", error))?;
            if parts.next().is_some() || verse == 0 || end_verse.is_some_and(|end| end < verse) {
                return Err(Error::new(
                    "usfm-range",
                    "USFM: numeración o rango no admitido.",
                ));
            }
            current = Some(Verse {
                book,
                chapter,
                verse,
                end_verse,
                text: trimmed[number_end..].into(),
            });
            omitted = false;
            continue;
        }
        if !closing
            && [
                "fr", "ft", "fk", "fq", "fqa", "xo", "xt", "vp", "va", "ca", "s", "s1", "s2", "s3",
                "r", "d", "cl", "cp", "rem",
            ]
            .contains(&tag)
        {
            omitted = true;
            continue;
        }
        if closing
            || [
                "p", "m", "q", "q1", "q2", "q3", "q4", "pi", "pi1", "pi2", "b", "nb", "li", "li1",
                "li2",
            ]
            .contains(&tag)
        {
            omitted = false;
        }
        if omitted || tag.ends_with("-s") || tag.ends_with("-e") {
            continue;
        }
        if let Some(verse) = &mut current {
            let words = if !closing && ["w", "wh", "wg", "jmp", "rb", "pro"].contains(&tag) {
                segment.split('|').next().unwrap_or_default()
            } else {
                segment
            };
            verse.text.push_str(words);
        }
    }
    flush(&mut current, &mut verses);
    if verses.is_empty() {
        return Err(Error::new(
            "usfm-empty",
            "No se encontraron versículos en el archivo USFM.",
        ));
    }
    Ok(verses)
}

pub fn usfm_bible(files: &[(String, String)], name: &str, id: &str) -> Result<Bible> {
    let mut verses = Vec::new();
    for (_, content) in files {
        verses.extend(parse_usfm(content)?);
    }
    verses.sort_by_key(|verse| (verse.book, verse.chapter, verse.verse));
    let mut references = BTreeSet::new();
    for verse in &verses {
        if !references.insert((verse.book, verse.chapter, verse.verse)) {
            return Err(Error::new(
                "usfm-duplicate",
                "El lote USFM contiene libros o versículos duplicados. Importa una sola traducción a la vez.",
            ));
        }
    }
    let bible = Bible {
        id: id.into(),
        name: name.into(),
        abbreviation: "USFM".into(),
        source: "Importación local USFM".into(),
        license: "Consultar la licencia de la traducción importada".into(),
        provenance: Some(
            serde_json::json!({"provider":"local","rights":"unspecified","offline":"unspecified","redistribution":"unspecified","attribution":"","licenseUrl":"","retrievedAt":0}),
        ),
        verses,
        extra: Default::default(),
    };
    validation::bible(&bible)?;
    Ok(bible)
}

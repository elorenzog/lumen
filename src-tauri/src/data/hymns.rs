use super::{
    domain::normalize,
    models::{Hymn, OldHymnCatalogEntry},
};
use crate::error::{Error, Result};
use serde::Deserialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
};

#[derive(Clone, Debug, Deserialize)]
pub struct NumberingEntry {
    pub id: u32,
    pub number2009: u32,
    pub number1962: Option<u32>,
    pub titles: Vec<String>,
}
#[derive(Clone, Debug, Deserialize)]
pub struct NumberingCatalog {
    pub version: u32,
    pub source: String,
    pub entries: Vec<NumberingEntry>,
}
pub fn read_numbering(path: &Path) -> Result<Option<NumberingCatalog>> {
    let raw = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    let catalog: NumberingCatalog = serde_json::from_slice(&raw)?;
    let mut ids = BTreeSet::new();
    let mut numbers = BTreeSet::new();
    if catalog.version != 1
        || catalog.source.is_empty()
        || catalog.source.len() > 200
        || catalog.entries.is_empty()
        || catalog.entries.len() > 2000
    {
        return Err(Error::new(
            "hymn-catalog",
            "El catálogo de numeración no es válido.",
        ));
    }
    for entry in &catalog.entries {
        if entry.id == 0
            || entry.number2009 == 0
            || entry.number1962 == Some(0)
            || !ids.insert(entry.id)
            || !numbers.insert(entry.number2009)
            || entry.titles.is_empty()
            || entry.titles.len() > 10
            || entry.titles.iter().any(String::is_empty)
        {
            return Err(Error::new(
                "hymn-catalog",
                "El catálogo contiene una numeración duplicada o inválida.",
            ));
        }
    }
    Ok(Some(catalog))
}
pub fn read_old_catalog(path: &Path) -> Result<Vec<OldHymnCatalogEntry>> {
    #[derive(Deserialize)]
    struct Catalog {
        version: u32,
        edition: String,
        source: String,
        entries: Vec<OldHymnCatalogEntry>,
    }
    let raw = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };
    let mut catalog: Catalog = serde_json::from_slice(&raw)?;
    let numbers: BTreeSet<_> = catalog.entries.iter().map(|entry| entry.number).collect();
    if catalog.version != 1
        || catalog.edition != "1962"
        || reqwest::Url::parse(&catalog.source).is_err()
        || catalog.entries.len() != 527
        || numbers != (1..=527).collect()
        || catalog
            .entries
            .iter()
            .any(|entry| entry.title.trim().is_empty() || entry.title.encode_utf16().count() > 500)
    {
        return Err(Error::new(
            "hymn-catalog",
            "El catálogo antiguo debe contener cada número del 1 al 527 exactamente una vez.",
        ));
    }
    for entry in &mut catalog.entries {
        entry.title = entry.title.trim().into();
    }
    catalog.entries.sort_by_key(|entry| entry.number);
    Ok(catalog.entries)
}
fn title_key(title: &str) -> String {
    normalize(title)
        .split(|c: char| !c.is_alphanumeric())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}
pub fn annotate(hymns: &[Hymn], catalog: &NumberingCatalog) -> Vec<Hymn> {
    let by_new: BTreeMap<_, _> = catalog
        .entries
        .iter()
        .map(|entry| (entry.number2009, entry))
        .collect();
    let mut by_old: BTreeMap<u32, Vec<&NumberingEntry>> = BTreeMap::new();
    for entry in &catalog.entries {
        if let Some(old) = entry.number1962 {
            by_old.entry(old).or_default().push(entry);
        }
    }
    hymns
        .iter()
        .map(|hymn| {
            let mut result = hymn.clone();
            let metadata = &hymn.metadata;
            if !metadata.numbering_source.is_empty()
                || metadata.number1962.is_some()
                || metadata.number2009.is_some()
            {
                return result;
            }
            let candidates = if metadata.edition == "1962" {
                by_old.get(&hymn.number).cloned().unwrap_or_default()
            } else {
                by_new.get(&hymn.number).copied().into_iter().collect()
            };
            let key = title_key(&hymn.title);
            let matches: Vec<_> = candidates
                .into_iter()
                .filter(|entry| entry.titles.iter().any(|title| title_key(title) == key))
                .collect();
            if let [entry] = matches.as_slice() {
                if metadata.edition == "unknown" {
                    result.metadata.edition = "2009".into();
                }
                result.metadata.number1962 = entry.number1962;
                result.metadata.number2009 = Some(entry.number2009);
                result.metadata.numbering_source = format!("{}:{}", catalog.source, entry.id);
                result.metadata.numbering_conflict = entry
                    .number1962
                    .is_some_and(|old| by_old.get(&old).is_some_and(|entries| entries.len() > 1));
            }
            result
        })
        .collect()
}
pub fn merge_imported_hymns(
    current: &[Hymn],
    incoming: &[Hymn],
    removed: &BTreeSet<String>,
) -> Vec<Hymn> {
    let mut merged: Vec<_> = current
        .iter()
        .filter(|hymn| !removed.contains(&hymn.id))
        .cloned()
        .collect();
    for hymn in incoming.iter().filter(|hymn| !removed.contains(&hymn.id)) {
        if let Some(existing) = merged.iter_mut().find(|item| item.id == hymn.id) {
            let metadata = existing.metadata.clone();
            let extra = existing.extra.clone();
            *existing = hymn.clone();
            existing.metadata = metadata;
            existing.extra.extend(extra);
        } else {
            merged.push(hymn.clone());
        }
    }
    merged
}

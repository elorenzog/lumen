use super::imports::{basename, extension};
use super::{Store, models::Bible, validation};
use crate::error::{Error, Result};
use serde::Serialize;
use std::{fs, path::Path};
#[derive(Clone, Debug, Default, Serialize)]
pub struct ImportOutcome {
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}
pub fn import_bible_directory(
    directory: &Path,
    destination: &mut Store,
    status: impl Fn(&str),
) -> Result<ImportOutcome> {
    let mut files = Vec::new();
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        if entry.file_type()?.is_file()
            && extension(&entry.path()) == "json"
            && entry.file_name() != "catalog.json"
        {
            files.push(entry.path());
        }
    }
    if files.is_empty() {
        return Err(Error::new(
            "bible-folder",
            "La carpeta no contiene Biblias JSON de LUMEN.",
        ));
    }
    if files.len() > 100 {
        return Err(Error::new(
            "bible-folder",
            "Importa como máximo 100 Biblias por carpeta.",
        ));
    }
    files.sort();
    let mut outcome = ImportOutcome::default();
    for (index, path) in files.iter().enumerate() {
        let mut install = || -> Result<bool> {
            if fs::metadata(path)?.len() > 40_000_000 {
                return Err(Error::new(
                    "bible-size",
                    "La Biblia supera el límite de 40 MB.",
                ));
            }
            let bible: Bible = serde_json::from_slice(&fs::read(path)?)?;
            validation::bible(&bible)?;
            if destination.has_bible(&bible.id)? {
                return Ok(false);
            }
            destination.add_bible(bible)?;
            Ok(true)
        };
        match install() {
            Ok(true) => outcome.imported += 1,
            Ok(false) => outcome.skipped += 1,
            Err(error) => outcome
                .errors
                .push(format!("{}: {}", basename(path), error.message)),
        }
        status(&format!(
            "Importando Biblias · {}/{}",
            index + 1,
            files.len()
        ));
    }
    Ok(outcome)
}

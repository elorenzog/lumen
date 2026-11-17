use super::{
    models::{Bible, Verse},
    usfm, validation, xml,
};
use crate::error::{Error, Result};
use serde::Deserialize;
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

pub fn import_bible(content: &str, name: &str, id: &str) -> Result<Bible> {
    if content.len() > 40_000_000 {
        return Err(Error::new("size", "La Biblia supera el límite de 40 MB."));
    }
    if name.to_lowercase().ends_with(".xml") {
        return xml::import_zefania(content, name, id);
    }
    let raw: serde_json::Value = serde_json::from_str(content)?;
    if let Ok(mut own) = serde_json::from_value::<Bible>(raw.clone()) {
        validation::bible(&own)?;
        own.id = id.into();
        return Ok(own);
    }
    #[derive(Deserialize)]
    struct Scroll {
        translation: String,
        books: Vec<Book>,
    }
    #[derive(Deserialize)]
    struct Book {
        name: String,
        chapters: Vec<Chapter>,
    }
    #[derive(Deserialize)]
    struct Chapter {
        chapter: u32,
        verses: Vec<ScrollVerse>,
    }
    #[derive(Deserialize)]
    struct ScrollVerse {
        verse: u32,
        text: String,
    }
    let scroll: Scroll = serde_json::from_value(raw)?;
    if scroll.books.len() != 66 {
        return Err(Error::new(
            "json",
            "El JSON debe contener los 66 libros canónicos.",
        ));
    }
    let mut verses = Vec::new();
    for (index, book) in scroll.books.into_iter().enumerate() {
        let _book_name = book.name;
        let book_number =
            u32::try_from(index + 1).map_err(|error| Error::external("book", error))?;
        for chapter in book.chapters {
            verses.extend(chapter.verses.into_iter().map(|entry| Verse {
                book: book_number,
                chapter: chapter.chapter,
                verse: entry.verse,
                end_verse: None,
                text: entry.text,
            }));
        }
    }
    let bible = Bible {
        id: id.into(),
        name: scroll.translation,
        abbreviation: "JSON".into(),
        source: "Importación local JSON (Scrollmapper)".into(),
        license: "Consultar derechos de la edición importada".into(),
        provenance: None,
        verses,
        extra: Default::default(),
    };
    validation::bible(&bible)?;
    Ok(bible)
}

pub(super) fn extension(path: &Path) -> String {
    path.extension()
        .map(|v| v.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}
pub(super) fn basename(path: &Path) -> String {
    path.file_name()
        .map(|v| v.to_string_lossy().into_owned())
        .unwrap_or_default()
}

pub fn import_bible_files(files: &[PathBuf]) -> Result<Bible> {
    let first = files
        .first()
        .ok_or_else(|| Error::new("file", "Selecciona un archivo."))?;
    for file in files {
        if fs::metadata(file)?.len() > 40_000_000 {
            return Err(Error::new(
                "size",
                "Cada archivo debe medir menos de 40 MB.",
            ));
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    if files.len() == 1 && ["json", "xml"].contains(&extension(first).as_str()) {
        return import_bible(&fs::read_to_string(first)?, &basename(first), &id);
    }
    let mut sources = Vec::new();
    if files.len() == 1 && extension(first) == "zip" {
        let mut archive = zip::ZipArchive::new(fs::File::open(first)?)
            .map_err(|error| Error::external("zip", error))?;
        let mut total = 0;
        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|error| Error::external("zip", error))?;
            if !["usfm", "sfm"].contains(&extension(Path::new(entry.name())).as_str()) {
                continue;
            }
            total += entry.size();
            if total > 80_000_000 || entry.size() > 10_000_000 || sources.len() >= 100 {
                return Err(Error::new(
                    "zip-size",
                    "El paquete USFM excede el tamaño o número de libros admitido.",
                ));
            }
            let mut content = String::new();
            entry
                .by_ref()
                .take(10_000_001)
                .read_to_string(&mut content)?;
            if content.len() > 10_000_000 {
                return Err(Error::new(
                    "zip-size",
                    "El archivo USFM supera el tamaño admitido.",
                ));
            }
            if sources
                .iter()
                .map(|(_, text): &(String, String)| text.len())
                .sum::<usize>()
                + content.len()
                > 80_000_000
            {
                return Err(Error::new(
                    "zip-size",
                    "El paquete USFM supera el tamaño admitido.",
                ));
            }
            sources.push((entry.name().to_owned(), content));
        }
    } else {
        if files
            .iter()
            .any(|file| !["usfm", "sfm"].contains(&extension(file).as_str()))
        {
            return Err(Error::new(
                "files",
                "Selecciona un JSON/XML, un ZIP USFM o varios archivos USFM de la misma traducción.",
            ));
        }
        let mut total = 0;
        for file in files {
            let content = fs::read_to_string(file)?;
            total += content.len();
            if total > 80_000_000 {
                return Err(Error::new("usfm-size", "El lote USFM supera 80 MB."));
            }
            sources.push((basename(file), content));
        }
    }
    if sources.is_empty() {
        return Err(Error::new(
            "zip-usfm",
            "No se encontraron archivos .usfm o .sfm en el paquete.",
        ));
    }
    let name = if files.len() > 1 {
        first.parent().map(basename).unwrap_or_default()
    } else {
        first
            .file_stem()
            .map(|v| v.to_string_lossy().into_owned())
            .unwrap_or_default()
    };
    usfm::usfm_bible(&sources, &name, &id)
}

pub use super::bible_directory::import_bible_directory;

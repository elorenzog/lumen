use super::{
    domain::BOOK_CODES,
    models::{Bible, Verse},
    now_ms, validation,
};
use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, time::Duration};

const BASE: &str = "https://v1.fetch.bible/";
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub id: String,
    pub name: String,
    pub abbreviation: String,
    pub license: String,
    pub source: String,
    pub attribution: String,
    pub license_url: String,
    pub notice: String,
}
#[derive(Deserialize)]
struct Manifest {
    bibles: BTreeMap<String, Value>,
}
#[derive(Deserialize)]
struct Translation {
    name: Name,
    copyright: Copyright,
}
#[derive(Deserialize)]
struct Name {
    local: String,
    local_abbrev: String,
    english: String,
}
#[derive(Deserialize)]
struct Copyright {
    licenses: Vec<License>,
    attribution: String,
}
#[derive(Deserialize)]
struct License {
    license: Value,
    url: String,
}
#[derive(Deserialize)]
struct Book {
    contents: Vec<Vec<Vec<Part>>>,
}
#[derive(Deserialize)]
#[serde(untagged)]
enum Part {
    Text(String),
    Annotation(BTreeMap<String, Value>),
}

fn client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()?)
}
async fn json<T: serde::de::DeserializeOwned>(client: &reqwest::Client, url: &str) -> Result<T> {
    match client
        .get(url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
    {
        Ok(response) => Ok(response.json::<T>().await?),
        Err(first)
            if first.is_timeout()
                || first.is_connect()
                || first
                    .status()
                    .is_some_and(|status| status.is_server_error() || status.as_u16() == 429) =>
        {
            Ok(client
                .get(url)
                .send()
                .await?
                .error_for_status()?
                .json::<T>()
                .await?)
        }
        Err(error) => Err(error.into()),
    }
}
pub async fn catalog() -> Result<Vec<CatalogEntry>> {
    let manifest: Manifest = json(&client()?, &format!("{BASE}manifest.json")).await?;
    parse_manifest(manifest)
}
fn parse_manifest(manifest: Manifest) -> Result<Vec<CatalogEntry>> {
    let mut entries = Vec::new();
    for id in ["spa_bll", "spa_blm"] {
        let Some(raw) = manifest.bibles.get(id) else {
            continue;
        };
        let Ok(translation) = serde_json::from_value::<Translation>(raw.clone()) else {
            continue;
        };
        if translation.copyright.licenses.is_empty()
            || translation
                .copyright
                .licenses
                .iter()
                .any(|license| license.license.as_str() != Some("public"))
        {
            continue;
        }
        let license_url = translation
            .copyright
            .licenses
            .first()
            .map(|license| license.url.clone())
            .unwrap_or_default();
        entries.push(CatalogEntry {
            id: id.into(),
            name: if translation.name.local.is_empty() {
                translation.name.english
            } else {
                translation.name.local
            },
            abbreviation: if translation.name.local_abbrev.is_empty() {
                if id == "spa_bll" { "BLL" } else { "BLM" }.into()
            } else {
                translation.name.local_abbrev
            },
            license: "Dominio público".into(),
            source: format!("{BASE}bibles/{id}/"),
            attribution: translation.copyright.attribution,
            license_url,
            notice: if id == "spa_bll" {
                "La fuente identifica esta edición como un borrador en revisión.".into()
            } else {
                String::new()
            },
        });
    }
    Ok(entries)
}
pub async fn download_bible(id: &str, status: impl Fn(&str)) -> Result<Bible> {
    if !["spa_bll", "spa_blm"].contains(&id) {
        return Err(Error::new(
            "license",
            "La edición no pertenece al catálogo autorizado.",
        ));
    }
    let entry = catalog()
        .await?
        .into_iter()
        .find(|entry| entry.id == id)
        .ok_or_else(|| {
            Error::new(
                "license",
                "Esta edición no está disponible como dominio público en el catálogo actual.",
            )
        })?;
    let client = client()?;
    let mut tasks = tokio::task::JoinSet::new();
    let mut next = 0;
    let mut complete = 0;
    let mut downloaded: BTreeMap<usize, Book> = BTreeMap::new();
    loop {
        while tasks.len() < 4 && next < BOOK_CODES.len() {
            let index = next;
            next += 1;
            let client = client.clone();
            let url = format!(
                "{BASE}bibles/{id}/txt/{}.json",
                BOOK_CODES[index].to_lowercase()
            );
            tasks.spawn(async move { json::<Book>(&client, &url).await.map(|book| (index, book)) });
        }
        let Some(result) = tasks.join_next().await else {
            break;
        };
        let (index, book) = result.map_err(|error| Error::external("download", error))??;
        downloaded.insert(index, book);
        complete += 1;
        status(&format!(
            "Descargando {} · {complete}/66 libros",
            entry.abbreviation
        ));
    }
    build_bible(entry, downloaded)
}
fn build_bible(entry: CatalogEntry, downloaded: BTreeMap<usize, Book>) -> Result<Bible> {
    let mut verses = Vec::new();
    for (index, book) in downloaded {
        for (chapter_index, chapter) in book.contents.into_iter().enumerate().skip(1) {
            for (verse_index, parts) in chapter.into_iter().enumerate().skip(1) {
                let raw: String = parts
                    .iter()
                    .filter_map(|part| match part {
                        Part::Text(text) => Some(text.as_str()),
                        Part::Annotation(metadata) => {
                            let _ = metadata;
                            None
                        }
                    })
                    .collect();
                let text = raw.split_whitespace().collect::<Vec<_>>().join(" ");
                if !text.is_empty() {
                    verses.push(Verse {
                        book: u32::try_from(index + 1)
                            .map_err(|error| Error::external("book", error))?,
                        chapter: u32::try_from(chapter_index)
                            .map_err(|error| Error::external("chapter", error))?,
                        verse: u32::try_from(verse_index)
                            .map_err(|error| Error::external("verse", error))?,
                        end_verse: None,
                        text,
                    });
                }
            }
        }
    }
    let books: std::collections::BTreeSet<_> = verses.iter().map(|verse| verse.book).collect();
    if books.len() != 66 {
        return Err(Error::new(
            "incomplete",
            "La descarga está incompleta. No se instaló la traducción.",
        ));
    }
    let bible = Bible {
        id: entry.id,
        name: entry.name,
        abbreviation: entry.abbreviation,
        source: entry.source,
        license: entry.license,
        provenance: Some(
            serde_json::json!({"provider":"fetch-bible","rights":"public-domain","offline":"allowed","redistribution":"allowed","attribution":entry.attribution,"licenseUrl":entry.license_url,"retrievedAt":now_ms(),"notice":entry.notice}),
        ),
        verses,
        extra: Default::default(),
    };
    validation::bible(&bible)?;
    Ok(bible)
}

#[cfg(test)]
#[path = "catalog_tests.rs"]
mod tests;

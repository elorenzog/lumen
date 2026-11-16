use self::{
    database::BibleDatabase,
    hymns::NumberingCatalog,
    models::{Bible, BibleInfo, Hymn, OldHymnCatalogEntry, Saved, Verse},
};
use crate::error::{Error, Result};
use std::{
    fs,
    path::{Path, PathBuf},
};

mod appearance;
pub mod bible_directory;
pub mod catalog;
pub mod database;
pub mod domain;
#[cfg(test)]
mod hymn_tests;
pub mod hymns;
#[cfg(test)]
mod import_tests;
pub mod imports;
pub mod models;
#[cfg(test)]
mod tests;
pub mod usfm;
pub mod validation;
mod xml;

pub struct Store {
    pub directory: PathBuf,
    pub saved: Saved,
    pub old_hymn_catalog: Vec<OldHymnCatalogEntry>,
    database: BibleDatabase,
    numbering_catalog: Option<NumberingCatalog>,
}
impl Store {
    pub fn open(directory: &Path, resources: &Path) -> Result<Self> {
        fs::create_dir_all(directory)?;
        let original = match fs::read(directory.join("library.json")) {
            Ok(bytes) => Some(bytes),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(error.into()),
        };
        let saved = match &original {
            Some(bytes) => serde_json::from_slice::<Saved>(bytes).map_err(|_| Error::new("library", "No se pudo leer la biblioteca guardada. No se sobrescribió. Revisa library.json en los datos de LUMEN."))?,
            None => Saved::default(),
        };
        validation::saved(&saved)?;
        let database = BibleDatabase::open(&directory.join("translations.sqlite"))?;
        let numbering_catalog = hymns::read_numbering(&resources.join("hymn-numbering.json"))?;
        let old_hymn_catalog = hymns::read_old_catalog(&resources.join("hymnal-1962.json"))?;
        let mut store = Self {
            directory: directory.into(),
            saved,
            old_hymn_catalog,
            database,
            numbering_catalog,
        };
        for filename in ["rv1909.json", "bll.json"] {
            let mut bible: Bible = serde_json::from_slice(&fs::read(resources.join(filename))?)?;
            if !store.database.has(&bible.id)? {
                if filename == "rv1909.json" {
                    bible.provenance = Some(
                        serde_json::json!({"provider":"ebible","rights":"public-domain","offline":"allowed","redistribution":"allowed","attribution":"Reina-Valera 1909 · eBible.org","licenseUrl":"https://ebible.org/spaRV1909/copyright.htm","retrievedAt":now_ms()}),
                    );
                }
                store.database.add(&bible)?;
            }
        }
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            let name = entry.file_name();
            let filename = name.to_string_lossy();
            if filename.starts_with("bible-") && filename.ends_with(".json") {
                let bible: Bible = serde_json::from_slice(&fs::read(entry.path())?)?;
                if !store.database.has(&bible.id)? {
                    store.database.add(&bible)?;
                }
            }
        }
        let hymns = store.annotate_hymns(&store.saved.hymns);
        if hymns != store.saved.hymns {
            if let Some(bytes) = original {
                let folder = directory.join("backups");
                fs::create_dir_all(&folder)?;
                let backup = folder.join(format!(
                    "library-before-numbering-{}.json",
                    uuid::Uuid::new_v4()
                ));
                use std::io::Write;
                fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(backup)?
                    .write_all(&bytes)?;
            }
            let mut saved = store.saved.clone();
            saved.hymns = hymns;
            store.save(saved)?;
        }
        Ok(store)
    }
    pub fn save(&mut self, saved: Saved) -> Result<()> {
        validation::saved(&saved)?;
        atomic_write(
            &self.directory.join("library.json"),
            &serde_json::to_vec(&saved)?,
        )?;
        self.saved = saved;
        Ok(())
    }
    pub fn infos(&self) -> Result<Vec<BibleInfo>> {
        self.database.infos()
    }
    pub fn bible(&self, id: &str) -> Result<Option<Bible>> {
        self.database.get(id)
    }
    pub fn search(&self, id: &str, query: &str) -> Result<Vec<Verse>> {
        self.database.search(id, query)
    }
    pub fn add_bible(&mut self, bible: Bible) -> Result<()> {
        self.database.add(&bible)
    }
    pub fn has_bible(&self, id: &str) -> Result<bool> {
        self.database.has(id)
    }
    pub fn annotate_hymns(&self, hymns: &[Hymn]) -> Vec<Hymn> {
        self.numbering_catalog
            .as_ref()
            .map_or_else(|| hymns.to_vec(), |catalog| hymns::annotate(hymns, catalog))
    }
}
pub fn atomic_write(file: &Path, bytes: &[u8]) -> Result<()> {
    use std::io::Write;
    let temporary = file.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let mut handle = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    handle.write_all(bytes)?;
    handle.sync_all()?;
    drop(handle);
    fs::rename(&temporary, file)?;
    Ok(())
}
pub fn now_ms() -> u64 {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    u64::try_from(millis).unwrap_or(u64::MAX)
}

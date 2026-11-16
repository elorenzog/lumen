use super::{
    domain::{BOOKS, reference_query},
    models::{Bible, BibleInfo, Verse},
    validation,
};
use crate::error::Result;
use rusqlite::{Connection, OptionalExtension, params};
use std::{cell::RefCell, path::Path};

pub struct BibleDatabase {
    db: Connection,
    catalog: RefCell<Option<(i64, Vec<BibleInfo>)>>,
}
fn verse(row: &rusqlite::Row<'_>) -> rusqlite::Result<Verse> {
    Ok(Verse {
        book: row.get(0)?,
        chapter: row.get(1)?,
        verse: row.get(2)?,
        end_verse: row.get(3)?,
        text: row.get(4)?,
    })
}
impl BibleDatabase {
    pub fn open(file: &Path) -> Result<Self> {
        let db = Connection::open(file)?;
        db.execute_batch(include_str!("schema.sql"))?;
        for (index, name) in BOOKS.iter().enumerate() {
            db.execute(
                "INSERT OR IGNORE INTO books(id,name) VALUES(?1,?2)",
                params![index + 1, name],
            )?;
        }
        Ok(Self {
            db,
            catalog: RefCell::new(None),
        })
    }
    pub fn has(&self, id: &str) -> Result<bool> {
        Ok(self
            .db
            .query_row("SELECT id FROM translations WHERE id=?1", [id], |r| {
                r.get::<_, String>(0)
            })
            .optional()?
            .is_some())
    }
    pub fn add(&mut self, bible: &Bible) -> Result<()> {
        validation::bible(bible)?;
        let mut metadata = serde_json::to_value(bible)?;
        if let Some(object) = metadata.as_object_mut() {
            object.remove("verses");
        }
        let transaction = self
            .db
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        transaction.execute("DELETE FROM translations WHERE id=?1", [&bible.id])?;
        transaction.execute(
            "INSERT INTO translations(id,metadata) VALUES(?1,?2)",
            params![bible.id, serde_json::to_string(&metadata)?],
        )?;
        {
            let mut chapter = transaction.prepare(
                "INSERT OR IGNORE INTO chapters(translation_id,book,chapter) VALUES(?1,?2,?3)",
            )?;
            let mut insert = transaction.prepare("INSERT INTO verses(translation_id,book,chapter,verse,end_verse,text) VALUES(?1,?2,?3,?4,?5,?6)")?;
            for entry in &bible.verses {
                chapter.execute(params![bible.id, entry.book, entry.chapter])?;
                insert.execute(params![
                    bible.id,
                    entry.book,
                    entry.chapter,
                    entry.verse,
                    entry.end_verse,
                    entry.text
                ])?;
            }
        }
        transaction.commit()?;
        *self.catalog.borrow_mut() = None;
        Ok(())
    }
    pub fn get(&self, id: &str) -> Result<Option<Bible>> {
        let metadata: Option<String> = self
            .db
            .query_row(
                "SELECT metadata FROM translations WHERE id=?1",
                [id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(metadata) = metadata else {
            return Ok(None);
        };
        let mut raw: serde_json::Value = serde_json::from_str(&metadata)?;
        let mut statement = self.db.prepare("SELECT book,chapter,verse,end_verse,text FROM verses WHERE translation_id=?1 ORDER BY book,chapter,verse")?;
        let verses = statement
            .query_map([id], verse)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        raw["verses"] = serde_json::to_value(verses)?;
        let result: Bible = serde_json::from_value(raw)?;
        validation::bible(&result)?;
        Ok(Some(result))
    }
    pub fn infos(&self) -> Result<Vec<BibleInfo>> {
        let version: i64 = self
            .db
            .query_row("PRAGMA data_version", [], |row| row.get(0))?;
        if let Some((cached_version, entries)) = &*self.catalog.borrow() {
            if *cached_version == version {
                return Ok(entries.clone());
            }
        }
        let mut statement = self.db.prepare("SELECT t.metadata,count(v.id) FROM translations t JOIN verses v ON v.translation_id=t.id GROUP BY t.id ORDER BY CASE WHEN t.id='rv1909' THEN 0 ELSE 1 END,t.id")?;
        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, u64>(1)?))
        })?;
        let mut entries = Vec::new();
        for row in rows {
            let (metadata, count) = row?;
            let mut raw: serde_json::Value = serde_json::from_str(&metadata)?;
            raw["count"] = count.into();
            entries.push(serde_json::from_value(raw)?);
        }
        *self.catalog.borrow_mut() = Some((version, entries.clone()));
        Ok(entries)
    }
    pub fn search(&self, id: &str, query: &str) -> Result<Vec<Verse>> {
        if let Some((book, chapter, from, to)) = reference_query(query) {
            let mut statement = self.db.prepare("SELECT book,chapter,verse,end_verse,text FROM verses WHERE translation_id=?1 AND book=?2 AND chapter=?3 AND verse<=?4 AND coalesce(end_verse,verse)>=?5 ORDER BY verse LIMIT 200")?;
            return Ok(statement
                .query_map(params![id, book, chapter, to, from], verse)?
                .collect::<rusqlite::Result<Vec<_>>>()?);
        }
        let tokens = regex::Regex::new(r"[\p{L}\p{N}]+")
            .map_err(|e| crate::error::Error::message(e.to_string()))?;
        let terms: Vec<_> = tokens
            .find_iter(query)
            .take(20)
            .map(|term| format!("\"{}\"*", term.as_str()))
            .collect();
        if terms.is_empty() {
            return Ok(Vec::new());
        }
        let mut statement = self.db.prepare("SELECT v.book,v.chapter,v.verse,v.end_verse,v.text FROM verses v JOIN verses_fts f ON f.rowid=v.id WHERE v.translation_id=?1 AND verses_fts MATCH ?2 ORDER BY v.book,v.chapter,v.verse LIMIT 100")?;
        Ok(statement
            .query_map(params![id, terms.join(" AND ")], verse)?
            .collect::<rusqlite::Result<Vec<_>>>()?)
    }
}

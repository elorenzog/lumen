use super::{hymns, models::Hymn};
use std::{collections::BTreeSet, fs};

fn fixture(number: u32, title: &str) -> Hymn {
    serde_json::from_value(serde_json::json!({"id":format!("h-{number}"),"number":number,"title":title,"path":format!("{number} {title}.mkv"),"duration":60,"tracks":[{"index":1,"label":"Cantado","language":"spa"}],"size":100,"modified":1})).expect("fixture")
}
fn catalog(folder: &std::path::Path) -> hymns::NumberingCatalog {
    let file = folder.join("numbering.json");
    fs::write(
        &file,
        include_bytes!("../../../resources/hymn-numbering.json"),
    )
    .expect("write");
    hymns::read_numbering(&file)
        .expect("catalog")
        .expect("catalog exists")
}
#[test]
fn numbering_attaches_both_editions_when_media_titles_match_public_catalog() {
    // Given all 613 catalog titles with their existing media identities.
    let folder = tempfile::tempdir().expect("directory");
    let catalog = catalog(folder.path());
    let hymns: Vec<_> = catalog
        .entries
        .iter()
        .map(|entry| fixture(entry.number2009, &entry.titles[0]))
        .collect();
    // When annotating the installed media library.
    let annotated = hymns::annotate(&hymns, &catalog);
    // Then cross-edition counts and the two explicit conflicts match the original catalog.
    assert_eq!(
        annotated
            .iter()
            .filter(|h| h.metadata.number2009.is_some())
            .count(),
        613
    );
    assert_eq!(
        annotated
            .iter()
            .filter(|h| h.metadata.number1962.is_some())
            .count(),
        367
    );
    assert_eq!(
        annotated
            .iter()
            .filter(|h| h.metadata.numbering_conflict)
            .map(|h| h.number)
            .collect::<Vec<_>>(),
        [193, 293]
    );
    assert!(
        annotated
            .iter()
            .zip(hymns)
            .all(|(a, b)| (a.id.as_str(), a.number, a.path.as_str())
                == (b.id.as_str(), b.number, b.path.as_str()))
    );
}
#[test]
fn numbering_preserves_manual_values_when_repeated_migration_runs() {
    // Given a media record whose owner manually assigned an old number.
    let folder = tempfile::tempdir().expect("directory");
    let catalog = catalog(folder.path());
    let mut original = fixture(3, "Unidos en espíritu");
    original.metadata.number1962 = Some(99);
    original.metadata.favorite = true;
    original.metadata.lyrics = "Texto personal".into();
    // When rerunning catalog annotation.
    let result = hymns::annotate(&[original.clone()], &catalog);
    // Then no user-assigned metadata is overwritten.
    assert_eq!(result, [original]);
}
#[test]
fn import_merge_keeps_latest_metadata_when_media_probe_finishes_later() {
    // Given a current record edited while an import is running.
    let incoming = fixture(3, "Unidos en espíritu");
    let mut current = incoming.clone();
    current.metadata.favorite = true;
    current.metadata.edition = "1962".into();
    current.metadata.lyrics = "Última edición".into();
    // When the newly probed media is committed.
    let result = hymns::merge_imported_hymns(&[current.clone()], &[incoming], &BTreeSet::new());
    // Then the latest manual metadata survives.
    assert_eq!(result, [current]);
}
#[test]
fn old_catalog_contains_metadata_only_when_all_titles_are_loaded() {
    // Given the public old hymnal catalog.
    let folder = tempfile::tempdir().expect("directory");
    let file = folder.path().join("old.json");
    fs::write(&file, include_bytes!("../../../resources/hymnal-1962.json")).expect("write");
    // When loading its independently maintained metadata.
    let entries = hymns::read_old_catalog(&file).expect("catalog");
    // Then all 527 ordered titles exist without any playback fields.
    assert_eq!(entries.len(), 527);
    assert_eq!(entries.first().map(|entry| entry.number), Some(1));
    assert_eq!(entries.last().map(|entry| entry.number), Some(527));
    let value = serde_json::to_value(&entries[0]).expect("JSON");
    assert_eq!(value.as_object().expect("object").len(), 2);
}

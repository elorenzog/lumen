use super::{
    Store, imports,
    models::{Bible, Saved},
};
use std::{fs, io::Write};

fn fixture(id: &str) -> Bible {
    serde_json::from_value(serde_json::json!({"id":id,"name":"Prueba","abbreviation":"P","source":"fixture","license":"fixture","verses":[{"book":43,"chapter":3,"verse":16,"text":"Texto original."}]})).expect("fixture")
}
fn store(folder: &std::path::Path) -> Store {
    let resources = folder.join("resources");
    fs::create_dir_all(&resources).expect("resources");
    for (name, id) in [("rv1909.json", "first"), ("bll.json", "second")] {
        fs::write(
            resources.join(name),
            serde_json::to_vec(&fixture(id)).expect("JSON"),
        )
        .expect("write");
    }
    Store::open(&folder.join("profile"), &resources).expect("open")
}
#[test]
fn directory_import_preserves_ids_when_installed_and_invalid_files_coexist() {
    // Given a folder containing installed, new, invalid, and catalog files.
    let folder = tempfile::tempdir().expect("directory");
    let mut destination = store(folder.path());
    let source = folder.path().join("source");
    fs::create_dir(&source).expect("create");
    for id in ["first", "new"] {
        fs::write(
            source.join(format!("{id}.json")),
            serde_json::to_vec(&fixture(id)).expect("JSON"),
        )
        .expect("write");
    }
    fs::write(source.join("invalid.json"), "{invalid").expect("write");
    fs::write(source.join("catalog.json"), "{}").expect("write");
    // When importing the folder into the real store.
    let outcome =
        imports::import_bible_directory(&source, &mut destination, |_| {}).expect("import");
    // Then installed IDs are skipped, new IDs survive, and invalid files are reported.
    assert_eq!(
        (outcome.imported, outcome.skipped, outcome.errors.len()),
        (1, 1, 1)
    );
    assert!(destination.bible("new").expect("read").is_some());
}
#[test]
fn zip_import_reads_canonical_usfm_when_entry_names_are_relative_paths() {
    // Given a ZIP whose USFM path would be unsafe to extract directly.
    let folder = tempfile::tempdir().expect("directory");
    let archive_path = folder.path().join("fixture.zip");
    let mut archive = zip::ZipWriter::new(fs::File::create(&archive_path).expect("create"));
    archive
        .start_file("../../JHN.usfm", zip::write::SimpleFileOptions::default())
        .expect("entry");
    archive
        .write_all(b"\\id JHN\n\\c 3\n\\v 16-17 Texto original.")
        .expect("write");
    archive.finish().expect("finish");
    // When importing the package without extracting it.
    let bible = imports::import_bible_files(&[archive_path]).expect("import");
    // Then the canonical reference and bridge survive and no file is extracted.
    assert_eq!(bible.verses[0].book, 43);
    assert_eq!(bible.verses[0].end_verse, Some(17));
    assert!(uuid::Uuid::parse_str(&bible.id).is_ok());
    assert!(!folder.path().join("JHN.usfm").exists());
}
#[test]
fn native_json_retains_provenance_and_future_fields_when_imported() {
    // Given an edition with provenance fields unknown to this version.
    let mut raw = serde_json::to_value(fixture("original")).expect("JSON");
    raw["futureEdition"] = serde_json::json!({"revision":2});
    raw["provenance"] =
        serde_json::json!({"provider":"local","rights":"unspecified","customSource":{"record":17}});
    // When importing the selected native file.
    let bible = imports::import_bible(&raw.to_string(), "edition.json", "new").expect("import");
    let result = serde_json::to_value(&bible).expect("serialize");
    // Then the source metadata remains lossless alongside the newly assigned ID.
    assert_eq!(result["futureEdition"], raw["futureEdition"]);
    assert_eq!(result["provenance"], raw["provenance"]);
}
#[test]
fn hymn_metadata_defaults_do_not_swallow_future_properties_when_serialized() {
    // Given a legacy hymn that predates numbering metadata.
    let mut saved = serde_json::to_value(Saved::default()).expect("JSON");
    saved["hymns"] = serde_json::json!([{"id":"h","number":3,"title":"Título","path":"source.mkv","duration":12,"tracks":[{"index":1,"label":"Audio","language":"spa"}],"size":100,"modified":1,"futureFlag":true}]);
    // When reading and serializing through typed persistence models.
    let parsed: Saved = serde_json::from_value(saved).expect("parse");
    let result = serde_json::to_value(parsed).expect("serialize");
    // Then defaults are applied and unknown data remains accessible.
    assert_eq!(result["hymns"][0]["futureFlag"], true);
    assert_eq!(result["hymns"][0]["edition"], "unknown");
    assert!(result["hymns"][0]["number1962"].is_null());
}

#[test]
fn hymn_modified_timestamp_preserves_ieee_bits_when_json_is_round_tripped() {
    // Given a persisted millisecond timestamp whose final decimal requires exact f64 parsing.
    let raw = r#"{"id":"precision-fixture","number":467,"title":"Fixture","path":"fixture.mkv","duration":12,"tracks":[{"index":1,"label":"Audio","language":"spa"}],"size":100,"modified":1794674045425.3843}"#;
    let expected: f64 = 1_794_674_045_425.384_3;
    // When parsing and serializing the native persistence model.
    let hymn: super::models::Hymn = serde_json::from_str(raw).expect("parse hymn");
    let serialized = serde_json::to_string(&hymn).expect("serialize hymn");
    let reparsed: super::models::Hymn = serde_json::from_str(&serialized).expect("reparse hymn");
    let json: serde_json::Value = serde_json::from_str(&serialized).expect("parse serialized JSON");
    // Then persistence and IPC JSON retain the exact original IEEE 754 value.
    assert_eq!(hymn.modified.to_bits(), expected.to_bits());
    assert_eq!(reparsed.modified.to_bits(), expected.to_bits());
    assert_eq!(
        json["modified"].as_f64().expect("timestamp").to_bits(),
        expected.to_bits()
    );
}

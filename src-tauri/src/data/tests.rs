use super::{database::BibleDatabase, imports::import_bible, models::Bible};

fn fixture() -> Bible {
    serde_json::from_value(serde_json::json!({"id":"first","name":"Primera","abbreviation":"P","source":"fixture","license":"Public domain","verses":[{"book":43,"chapter":3,"verse":16,"endVerse":17,"text":"Dios amó al mundo."}]})).expect("fixture")
}

#[test]
fn search_preserves_accents_and_bridges_when_database_is_imported() {
    // Given an installed translation with an original verse bridge.
    let mut db = BibleDatabase::open(std::path::Path::new(":memory:")).expect("open");
    db.add(&fixture()).expect("install");
    // When searching by accent-free words and an enclosed verse reference.
    let words = db.search("first", "amo").expect("search");
    let reference = db.search("first", "Juan 3:17").expect("reference");
    // Then both searches return the original unduplicated wording.
    assert_eq!(words, reference);
    assert_eq!(words[0].end_verse, Some(17));
}

#[test]
fn failed_replacement_keeps_original_translation_when_references_collide() {
    // Given an installed translation.
    let mut db = BibleDatabase::open(std::path::Path::new(":memory:")).expect("open");
    let original = fixture();
    db.add(&original).expect("install");
    let mut duplicate = original.clone();
    duplicate.verses.push(duplicate.verses[0].clone());
    // When an invalid replacement is attempted.
    let result = db.add(&duplicate);
    // Then the complete installed translation survives the rollback.
    assert!(result.is_err());
    assert_eq!(db.get("first").expect("read"), Some(original));
}

#[test]
fn json_import_assigns_new_identity_when_native_file_is_selected() {
    // Given a native LUMEN export.
    let raw = serde_json::to_string(&fixture()).expect("serialize");
    // When importing a single selected file.
    let bible = import_bible(&raw, "fixture.json", "replacement").expect("import");
    // Then its new identity preserves its complete content.
    assert_eq!(bible.id, "replacement");
    assert_eq!(bible.verses, fixture().verses);
}

#[test]
fn xml_preserves_words_and_metadata_when_entities_are_predefined() {
    // Given plain Zefania verses containing XML entities.
    let raw = "<XMLBIBLE biblename=\"Prueba &amp; texto\"><INFORMATION><identifier>T</identifier><rights>Local</rights></INFORMATION><BIBLEBOOK bnumber=\"43\"><CHAPTER cnumber=\"3\"><VERS vnumber=\"16\">Dios &amp; el mundo &#xE1;.</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>";
    // When importing the valid document.
    let bible = import_bible(raw, "fixture.xml", "xml").expect("import");
    // Then entities and attribution survive as plain text.
    assert_eq!(bible.name, "Prueba & texto");
    assert_eq!(bible.verses[0].text, "Dios & el mundo á.");
    assert_eq!(bible.license, "Local");
}

#[test]
fn xml_rejects_nested_verse_markup_when_content_could_be_lost() {
    // Given a verse whose nested formatting is outside the supported format.
    let raw = "<XMLBIBLE><BIBLEBOOK bnumber=\"43\"><CHAPTER cnumber=\"3\"><VERS vnumber=\"16\">Texto <STYLE>importante</STYLE></VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>";
    // When importing the document.
    let result = import_bible(raw, "fixture.xml", "xml");
    // Then the document is rejected before installation.
    assert!(result.is_err());
}

#[test]
fn usfm_preserves_bridge_and_inline_word_when_notes_are_omitted() {
    // Given an authorized USFM excerpt with lexical attributes and editorial notes.
    let raw = r#"\id JHN Prueba
\c 3
\v 16 Porque \w amó|lemma="amor"\w* Dios\f + \ft Nota editorial.\f* al mundo.
\v 17-18 Texto combinado original.
"#;
    // When parsing the source excerpt.
    let verses = super::usfm::parse_usfm(raw).expect("parse");
    // Then words and original verse bridges remain intact.
    assert_eq!(verses[0].text, "Porque amó Dios al mundo.");
    assert_eq!(verses[1].end_verse, Some(18));
    assert_eq!(verses.len(), 2);
}

#[test]
fn usfm_rejects_duplicate_books_when_batch_combines_translations() {
    // Given two USFM files with the same reference.
    let raw = "\\id JHN\n\\c 3\n\\v 16 Texto.";
    let files = vec![("a.sfm".into(), raw.into()), ("b.sfm".into(), raw.into())];
    // When parsing them as a single edition.
    let result = super::usfm::usfm_bible(&files, "Fixture", "duplicate");
    // Then ambiguous duplicate references are rejected.
    assert!(result.is_err());
}

#[test]
fn usfm_omits_figure_attributes_when_inline_links_preserve_their_words() {
    // Given figure metadata and a link whose text belongs to the verse.
    let raw = "\\id JHN\n\\c 3\n\\v 16 Antes \\fig dibujo|src=\"image.jpg\"\\fig* \\jmp frase|link-href=\"url\"\\jmp* después.";
    // When importing richly annotated source text.
    let verses = super::usfm::parse_usfm(raw).expect("parse");
    // Then hidden media attributes stay omitted and linked wording survives.
    assert_eq!(verses[0].text, "Antes frase después.");
}

#[test]
fn store_preserves_unknown_metadata_when_saved_library_is_reopened() {
    // Given native library data and bundled translation fixtures.
    let folder = tempfile::tempdir().expect("temporary directory");
    let resources = folder.path().join("resources");
    let profile = folder.path().join("profile");
    std::fs::create_dir_all(&resources).expect("resources");
    std::fs::create_dir_all(&profile).expect("profile");
    let bible = fixture();
    std::fs::write(
        resources.join("rv1909.json"),
        serde_json::to_vec(&bible).expect("bible JSON"),
    )
    .expect("write");
    let mut second = bible;
    second.id = "second".into();
    std::fs::write(
        resources.join("bll.json"),
        serde_json::to_vec(&second).expect("bible JSON"),
    )
    .expect("write");
    let mut saved = serde_json::to_value(super::models::Saved::default()).expect("saved JSON");
    saved["futureField"] = serde_json::json!({"nested":true});
    saved["settings"]["futureSetting"] = serde_json::json!("preserved");
    let original = serde_json::to_vec(&saved).expect("JSON");
    std::fs::write(profile.join("library.json"), &original).expect("write");
    // When opening and saving through the real SQLite-backed store.
    let mut store = super::Store::open(&profile, &resources).expect("open");
    assert_eq!(
        std::fs::read(profile.join("library.json")).expect("read"),
        original
    );
    store.save(store.saved.clone()).expect("save");
    let result: serde_json::Value =
        serde_json::from_slice(&std::fs::read(profile.join("library.json")).expect("read"))
            .expect("parse");
    // Then unknown metadata remains available and bundled translations are independent.
    assert_eq!(result["futureField"], saved["futureField"]);
    assert_eq!(
        result["settings"]["futureSetting"],
        saved["settings"]["futureSetting"]
    );
    assert_eq!(store.infos().expect("catalog").len(), 2);
}

#[test]
fn corrupt_library_remains_byte_identical_when_store_refuses_to_open() {
    // Given a saved file that cannot be parsed.
    let folder = tempfile::tempdir().expect("temporary directory");
    let file = folder.path().join("library.json");
    std::fs::write(&file, b"{invalid").expect("write");
    // When initialization encounters the invalid file.
    let result = super::Store::open(folder.path(), folder.path());
    // Then no default library overwrites the original bytes.
    assert!(result.is_err());
    assert_eq!(std::fs::read(file).expect("read"), b"{invalid");
}

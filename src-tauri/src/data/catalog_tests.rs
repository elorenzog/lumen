use super::*;
#[test]
fn catalog_excludes_editions_when_manifest_does_not_grant_public_license() {
    // Given public and restricted versions in a remote manifest.
    let entry = |license: &str| serde_json::json!({"name":{"local":"Nombre","local_abbrev":"N","english":"Name"},"copyright":{"licenses":[{"license":license,"url":"https://example.test/license"}],"attribution":"Fuente"}});
    let manifest = Manifest {
        bibles: [
            ("spa_bll".into(), entry("public")),
            ("spa_blm".into(), entry("restricted")),
            ("other".into(), entry("public")),
        ]
        .into_iter()
        .collect(),
    };
    // When interpreting the license-gated download catalog.
    let entries = parse_manifest(manifest).expect("manifest");
    // Then only explicitly supported public editions can be downloaded.
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].id, "spa_bll");
}
#[test]
fn download_rejects_incomplete_books_when_an_edition_is_missing_content() {
    // Given a response assembled without all canonical books.
    let entry = CatalogEntry {
        id: "spa_bll".into(),
        name: "Name".into(),
        abbreviation: "N".into(),
        license: "Public".into(),
        source: "fixture".into(),
        attribution: String::new(),
        license_url: String::new(),
        notice: String::new(),
    };
    // When preparing the edition for atomic installation.
    let result = build_bible(entry, BTreeMap::new());
    // Then partial content cannot enter the database.
    assert!(result.is_err());
}

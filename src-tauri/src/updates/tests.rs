use super::{UpdateInfo, installation_permitted};

fn downloaded() -> UpdateInfo {
    UpdateInfo {
        current_version: "0.9.0".into(),
        status: "downloaded".into(),
        version: "0.9.1".into(),
        notes: String::new(),
        progress: 100,
        message: String::new(),
        check_at_startup: true,
        installable: true,
    }
}

#[test]
fn active_projection_blocks_even_a_verified_download() {
    let error =
        installation_permitted(&downloaded(), true).expect_err("Projection must block restart");
    assert_eq!(error.code, "updater-live");
}

#[test]
fn every_incomplete_download_state_blocks_installation() {
    for status in [
        "idle",
        "checking",
        "current",
        "available",
        "downloading",
        "error",
    ] {
        let mut info = downloaded();
        info.status = status.into();
        assert!(
            installation_permitted(&info, false).is_err(),
            "Unexpected install in {status}"
        );
    }
}

#[test]
fn portable_install_requires_manual_installer() {
    let mut info = downloaded();
    info.installable = false;
    assert!(installation_permitted(&info, false).is_err());
}

#[test]
fn verified_download_and_closed_output_allow_explicit_install() {
    assert!(installation_permitted(&downloaded(), false).is_ok());
}

use super::*;
use std::sync::Arc;

pub(super) fn service(name: &str) -> (MediaService, PathBuf) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let directory =
        std::env::temp_dir().join(format!("lumen-rust-{name}-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&directory).expect("fixture directory");
    let service = MediaService::new(
        root.join("node_modules/ffmpeg-static/ffmpeg.exe"),
        root.join("node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe"),
        directory.join("cache"),
    )
    .expect("service");
    (service, directory)
}

pub(super) async fn fixture(service: &MediaService, directory: &Path) -> Hymn {
    let file = directory.join("001 Fixture dos pistas.mkv");
    let mut arguments: Vec<std::ffi::OsString> = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=160x90:r=10:d=8",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=8",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:duration=8",
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-map",
        "2:a",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a:0",
        "aac",
        "-c:a:1",
        "libmp3lame",
        "-shortest",
    ]
    .iter()
    .map(std::ffi::OsString::from)
    .collect();
    arguments.push(file.into_os_string());
    service
        .process
        .run(&service.ffmpeg, &arguments, &CancellationToken::new(), None)
        .await
        .expect("fixture ffmpeg");
    service
        .inspect_hymn(&directory.join("001 Fixture dos pistas.mkv"))
        .await
        .expect("inspect fixture")
}

#[tokio::test]
async fn selected_tracks_produce_compatible_mp4_and_reuse_only_complete_cache() {
    let (service, directory) = service("tracks");
    let _cleanup = scopeguard::guard(directory.clone(), |path| {
        let _ = std::fs::remove_dir_all(path);
    });
    let hymn = fixture(&service, &directory).await;
    assert_eq!(
        hymn.tracks
            .iter()
            .map(|track| track.index)
            .collect::<Vec<_>>(),
        vec![1, 2]
    );
    for track in [1, 2] {
        let target = service
            .prepare_hymn(&hymn, track, CancellationToken::new(), Arc::new(|_| {}))
            .await
            .expect("prepare");
        let info = service
            .probe(&target, &CancellationToken::new())
            .await
            .expect("probe");
        assert_eq!(
            info.streams
                .iter()
                .filter_map(|stream| stream.codec_name.as_deref())
                .collect::<Vec<_>>(),
            vec!["h264", "aac"]
        );
        let before = std::fs::metadata(&target)
            .expect("metadata")
            .modified()
            .expect("mtime");
        let reused = service
            .prepare_hymn(
                &hymn,
                track,
                CancellationToken::new(),
                Arc::new(|_| panic!("cache hit emitted progress")),
            )
            .await
            .expect("reuse");
        assert_eq!(target, reused);
        assert_eq!(
            before,
            std::fs::metadata(&reused)
                .expect("metadata")
                .modified()
                .expect("mtime")
        );
        std::fs::write(&target, b"damaged cache").expect("damage");
        service
            .prepare_hymn(&hymn, track, CancellationToken::new(), Arc::new(|_| {}))
            .await
            .expect("rebuild");
        assert!(
            service
                .probe(&target, &CancellationToken::new())
                .await
                .is_ok()
        );
    }
}

#[tokio::test]
async fn cancellation_of_one_same_track_request_does_not_cancel_another() {
    let (service, directory) = service("independent");
    let _cleanup = scopeguard::guard(directory.clone(), |path| {
        let _ = std::fs::remove_dir_all(path);
    });
    let hymn = fixture(&service, &directory).await;
    let cancelled = CancellationToken::new();
    let cancel_progress = cancelled.clone();
    let first = service.prepare_hymn(
        &hymn,
        2,
        cancelled,
        Arc::new(move |message| {
            if message.ends_with('%') {
                cancel_progress.cancel();
            }
        }),
    );
    let second = service.prepare_hymn(&hymn, 2, CancellationToken::new(), Arc::new(|_| {}));
    let (first, second) = tokio::join!(first, second);
    assert!(first.expect_err("cancelled preparation").is_cancelled());
    assert!(
        service
            .probe(&second.expect("survivor"), &CancellationToken::new())
            .await
            .is_ok()
    );
    let names = std::fs::read_dir(directory.join("cache")).expect("cache");
    assert!(
        names
            .filter_map(std::result::Result::ok)
            .all(|entry| !entry.file_name().to_string_lossy().contains(".tmp"))
    );
}

#[test]
fn codec_policy_copies_video_and_converts_only_incompatible_audio() {
    let video = probe::Stream {
        codec_name: Some("h264".into()),
        pix_fmt: Some("yuv420p".into()),
        ..Default::default()
    };
    let audio = probe::Stream {
        codec_name: Some("mp3".into()),
        ..Default::default()
    };
    assert_eq!(encoding::options(&video, &audio)[..2], ["-c:v", "copy"]);
    assert!(encoding::options(&video, &audio).contains(&"aac"));
}

#[test]
fn ranges_support_seek_and_reject_invalid_or_unsatisfiable_ranges() {
    assert_eq!(server::byte_range(Some("bytes=3-5"), 10), Some((3, 5)));
    assert_eq!(server::byte_range(Some("bytes=3-"), 10), Some((3, 9)));
    assert_eq!(server::byte_range(Some("bytes=3-99"), 10), Some((3, 9)));
    assert_eq!(server::byte_range(Some("bytes=10-20"), 10), None);
    assert_eq!(server::byte_range(Some("bytes=-5"), 10), None);
    assert_eq!(server::byte_range(Some("bytes=3-5,7-9"), 10), None);
}

use super::process::{ProcessRunner, Progress};
use std::{ffi::OsString, path::PathBuf, sync::Arc, time::Duration};
use tokio_util::sync::CancellationToken;

#[tokio::test]
async fn real_ffmpeg_is_terminated_and_reaped_before_cancellation_returns()
-> Result<(), Box<dyn std::error::Error>> {
    let runner = ProcessRunner {
        shutdown: CancellationToken::new(),
    };
    let binary =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../node_modules/ffmpeg-static/ffmpeg.exe");
    let directory = tempfile::tempdir()?;
    let output = directory.path().join("cancelled.mp4");
    let mut arguments: Vec<OsString> = [
        "-v",
        "error",
        "-re",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=160x90:r=10",
        "-c:v",
        "libx264",
        "-progress",
        "pipe:1",
        "-f",
        "mp4",
    ]
    .iter()
    .map(OsString::from)
    .collect();
    arguments.push(output.as_os_str().to_owned());
    let token = CancellationToken::new();
    let cancel = token.clone();
    let progress: Progress = Arc::new(move |chunk| {
        if chunk.contains("progress=") {
            cancel.cancel();
        }
    });
    let result = tokio::time::timeout(
        Duration::from_secs(10),
        runner.run(&binary, &arguments, &token, Some(progress)),
    )
    .await?;
    assert!(result.is_err_and(|error| error.is_cancelled()));
    tokio::fs::remove_file(output).await?;
    Ok(())
}

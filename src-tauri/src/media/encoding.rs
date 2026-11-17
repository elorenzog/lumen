use super::probe::Stream;

pub(super) fn options(video: &Stream, audio: &Stream) -> Vec<&'static str> {
    let copy_video = video.codec_name.as_deref() == Some("h264")
        && matches!(video.pix_fmt.as_deref(), Some("yuv420p" | "yuvj420p"));
    let copy_audio = audio.codec_name.as_deref() == Some("aac")
        && audio.channels.unwrap_or(2) <= 2
        && matches!(audio.profile.as_deref(), None | Some("LC"));
    let mut options = if copy_video {
        vec!["-c:v", "copy"]
    } else {
        vec![
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-vf",
            "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        ]
    };
    options.extend(if copy_audio {
        vec!["-c:a", "copy"]
    } else {
        vec!["-c:a", "aac", "-b:a", "192k", "-ac", "2"]
    });
    options
}

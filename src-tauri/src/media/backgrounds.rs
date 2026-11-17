use super::{MediaService, cache::TemporaryFiles};
use crate::{
    data::models::BackgroundAsset,
    error::{Error, Result},
};
use serde::Deserialize;
use std::{ffi::OsString, path::Path};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

impl MediaService {
    pub async fn import_background(
        &self,
        source: &Path,
        directory: &Path,
        kind: &str,
    ) -> Result<BackgroundAsset> {
        let maximum = match kind {
            "image" => 30_u64,
            "video" => 500_u64,
            _ => return Err(Error::new("background-format", "Tipo de fondo no válido.")),
        };
        let metadata = tokio::fs::metadata(source).await?;
        if !metadata.is_file() || metadata.len() > maximum * 1024 * 1024 {
            return Err(Error::new(
                "background-size",
                "Elige una imagen de hasta 30 MB o un vídeo de hasta 500 MB.",
            ));
        }
        let extension = source
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let id = Uuid::new_v4().to_string();
        let folder = directory.join("backgrounds");
        tokio::fs::create_dir_all(&folder).await?;
        let file = match kind {
            "image" => {
                if !matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "webp") {
                    return Err(Error::new("background-format", "Usa PNG, JPG o WebP."));
                }
                let file = format!("{id}.png");
                let source = source.to_owned();
                let destination = folder.join(&file);
                tokio::task::spawn_blocking(move || convert_image(&source, &destination))
                    .await
                    .map_err(|error| Error::new("background-image", error.to_string()))??;
                file
            }
            "video" => {
                if !matches!(extension.as_str(), "mp4" | "webm") {
                    return Err(Error::new(
                        "background-format",
                        "Usa MP4 (H.264) o WebM para el fondo de vídeo.",
                    ));
                }
                let mut arguments: Vec<OsString> = [
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "stream=codec_name",
                    "-of",
                    "json",
                ]
                .iter()
                .map(OsString::from)
                .collect();
                arguments.push(source.as_os_str().to_owned());
                let probe: VideoProbe = serde_json::from_slice(
                    &self
                        .process
                        .run(&self.ffprobe, &arguments, &CancellationToken::new(), None)
                        .await?,
                )?;
                let codec = probe
                    .streams
                    .first()
                    .map(|stream| stream.codec_name.as_str());
                let compatible = match extension.as_str() {
                    "mp4" => matches!(codec, Some("h264" | "av1")),
                    "webm" => matches!(codec, Some("vp8" | "vp9" | "av1")),
                    _ => false,
                };
                if !compatible {
                    return Err(Error::new(
                        "background-codec",
                        "Este vídeo no tiene un formato compatible. Usa MP4 con H.264 o WebM con VP8/VP9.",
                    ));
                }
                let file = format!("{id}.{extension}");
                let destination = folder.join(&file);
                let cleanup = TemporaryFiles(vec![destination.clone()]);
                tokio::fs::copy(source, destination).await?;
                cleanup.persist();
                file
            }
            _ => return Err(Error::new("background-format", "Tipo de fondo no válido.")),
        };
        Ok(BackgroundAsset {
            id,
            name: source
                .file_name()
                .map(|name| name.to_string_lossy().chars().take(255).collect())
                .unwrap_or_default(),
            kind: kind.to_owned(),
            file,
            extra: Default::default(),
        })
    }
}

fn convert_image(source: &Path, destination: &Path) -> Result<()> {
    let reader = image::ImageReader::open(source)?.with_guessed_format()?;
    let (width, height) = reader.into_dimensions().map_err(image_error)?;
    if u64::from(width) * u64::from(height) > 40_000_000 || width == 0 || height == 0 {
        return Err(image_error("La imagen supera los 40 megapíxeles."));
    }
    let image = image::ImageReader::open(source)?
        .with_guessed_format()?
        .decode()
        .map_err(image_error)?;
    let cleanup = TemporaryFiles(vec![destination.to_owned()]);
    image
        .save_with_format(destination, image::ImageFormat::Png)
        .map_err(image_error)?;
    cleanup.persist();
    Ok(())
}

fn image_error(error: impl std::fmt::Display) -> Error {
    Error::new(
        "background-image",
        format!("No se pudo abrir la imagen: {error}"),
    )
}

#[derive(Deserialize)]
struct VideoProbe {
    streams: Vec<VideoStream>,
}
#[derive(Deserialize)]
struct VideoStream {
    codec_name: String,
}

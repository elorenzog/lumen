use axum::body::Body;
use bytes::Bytes;
use tokio::{fs::File, io::AsyncReadExt};
use tokio_util::sync::CancellationToken;

pub(super) fn body(file: File, length: u64, token: CancellationToken) -> Body {
    let stream = futures_util::stream::try_unfold(
        (file, length, token),
        |(mut file, remaining, token)| async move {
            if remaining == 0 {
                return Ok(None);
            }
            let mut buffer = vec![
                0_u8;
                usize::try_from(remaining.min(64 * 1024))
                    .map_err(std::io::Error::other)?
            ];
            let count = tokio::select! {
                biased;
                _ = token.cancelled() => return Err(std::io::Error::new(std::io::ErrorKind::ConnectionAborted, "Media revoked")),
                count = file.read(&mut buffer) => count?,
            };
            if count == 0 {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::UnexpectedEof,
                    "Media truncated",
                ));
            }
            buffer.truncate(count);
            Ok(Some((
                Bytes::from(buffer),
                (
                    file,
                    remaining - u64::try_from(count).map_err(std::io::Error::other)?,
                    token,
                ),
            )))
        },
    );
    Body::from_stream(stream)
}

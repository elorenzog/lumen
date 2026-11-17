use super::{
    RemoteCommand, RemoteSearch, contracts::Pair, response::Failure, security::session_token,
    service::HttpState,
};
use axum::{
    Json,
    body::to_bytes,
    extract::{ConnectInfo, Request, State},
    http::{HeaderValue, Method, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::de::DeserializeOwned;
use serde_json::json;
use std::{
    net::SocketAddr,
    time::{Duration, Instant},
};

pub(super) async fn dispatch(State(state): State<HttpState>, request: Request) -> Response {
    match handle(state, request).await {
        Ok(response) => response,
        Err(error) => error.into_response(),
    }
}
async fn handle(state: HttpState, request: Request) -> Result<Response, Failure> {
    let method = request.method().clone();
    let path = request.uri().path();
    if method == Method::GET {
        let asset = match path {
            "/" => Some(("index.html", "text/html; charset=utf-8")),
            "/remote.js" => Some(("remote.js", "text/javascript")),
            "/remote.css" => Some(("remote.css", "text/css")),
            _ => None,
        };
        if let Some((filename, mime)) = asset {
            let read = tokio::fs::read(state.inner.assets.join(filename));
            let bytes = tokio::time::timeout(Duration::from_secs(15), read)
                .await
                .map_err(|_| {
                    Failure::new(StatusCode::REQUEST_TIMEOUT, "La solicitud tardó demasiado.")
                })?
                .map_err(|error| match error.kind() {
                    std::io::ErrorKind::NotFound => missing(),
                    _ => Failure::new(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "No se pudo completar la acción. Reintenta desde el teléfono.",
                    ),
                })?;
            return Ok(([(header::CONTENT_TYPE, mime)], bytes).into_response());
        }
    }
    if !path.starts_with("/api/") {
        return Err(missing());
    }
    if method == Method::POST && path == "/api/pair" {
        return pair(&state, request).await;
    }
    let token = session_token(request.headers()).ok_or_else(unpaired)?;
    if !state
        .inner
        .sessions
        .lock()
        .authenticated(&token, Instant::now())
    {
        return Err(unpaired());
    }
    match (method, path) {
        (Method::GET, "/api/state") => {
            Ok(Json(state.inner.adapter.state().await?.redact()).into_response())
        }
        (Method::GET, "/api/library") => {
            Ok(Json(state.inner.adapter.library().await?).into_response())
        }
        (Method::POST, "/api/search") => {
            let input: RemoteSearch = body(request).await?;
            let input = input.validate().map_err(|_| invalid())?;
            Ok(Json(state.inner.adapter.search(input).await?).into_response())
        }
        (Method::POST, "/api/command") => {
            let input: RemoteCommand = body(request).await?;
            let input = input.validate().map_err(|_| invalid())?;
            Ok(Json(state.inner.adapter.command(input).await?.redact()).into_response())
        }
        (Method::POST, "/api/logout") => {
            state.inner.sessions.lock().logout(&token);
            (state.inner.changed)();
            cookie_response("lumen_remote=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0")
        }
        _ => Err(missing()),
    }
}
async fn pair(state: &HttpState, request: Request) -> Result<Response, Failure> {
    let peer = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|info| info.0.ip())
        .ok_or_else(unpaired)?;
    let peer = match peer {
        std::net::IpAddr::V6(ip) => ip
            .to_ipv4_mapped()
            .map(std::net::IpAddr::V4)
            .unwrap_or(peer),
        std::net::IpAddr::V4(_) => peer,
    };
    state.inner.sessions.lock().attempt(peer, Instant::now())?;
    let input: Pair = body(request).await?;
    if input.pin.encode_utf16().count() > 20 {
        return Err(invalid());
    }
    let token = state
        .inner
        .sessions
        .lock()
        .pair(peer, &input.pin, Instant::now())?;
    (state.inner.changed)();
    cookie_response(&format!(
        "lumen_remote={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800"
    ))
}
fn cookie_response(cookie: &str) -> Result<Response, Failure> {
    let mut response = Json(json!({"ok": true})).into_response();
    let cookie = HeaderValue::from_str(cookie).map_err(|_| {
        Failure::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "No se pudo vincular el teléfono.",
        )
    })?;
    response.headers_mut().insert(header::SET_COOKIE, cookie);
    Ok(response)
}
async fn body<T: DeserializeOwned>(request: Request) -> Result<T, Failure> {
    let content_type = request
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    let (mime, _) = content_type.split_once(';').unwrap_or((content_type, ""));
    if !mime.eq_ignore_ascii_case("application/json") {
        return Err(Failure::new(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Envía datos JSON.",
        ));
    }
    let bytes = tokio::time::timeout(Duration::from_secs(15), to_bytes(request.into_body(), 8192))
        .await
        .map_err(|_| Failure::new(StatusCode::REQUEST_TIMEOUT, "La solicitud tardó demasiado."))?
        .map_err(|_| {
            Failure::new(
                StatusCode::PAYLOAD_TOO_LARGE,
                "La solicitud es demasiado grande.",
            )
        })?;
    serde_json::from_slice(&bytes).map_err(|error| {
        if error.is_data() {
            invalid()
        } else {
            Failure::new(StatusCode::BAD_REQUEST, "JSON no válido.")
        }
    })
}
fn unpaired() -> Failure {
    Failure::new(
        StatusCode::UNAUTHORIZED,
        "Vincula el teléfono con el PIN de LUMEN.",
    )
}
fn missing() -> Failure {
    Failure::new(StatusCode::NOT_FOUND, "Recurso no disponible.")
}
fn invalid() -> Failure {
    Failure::new(
        StatusCode::BAD_REQUEST,
        "Los datos enviados no son válidos.",
    )
}

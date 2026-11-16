use crate::error::Error;
use axum::{
    Json,
    http::{HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use serde_json::json;

#[derive(Debug)]
pub(super) struct Failure(pub StatusCode, pub String);
impl Failure {
    pub fn new(status: StatusCode, message: &str) -> Self {
        Self(status, message.to_owned())
    }
}
impl From<Error> for Failure {
    fn from(error: Error) -> Self {
        let safe = [
            "output",
            "display",
            "reference",
            "bible",
            "range",
            "hymn",
            "program",
            "track",
        ];
        let message = if safe.contains(&error.code.as_str()) {
            error.message
        } else {
            "No se pudo preparar el contenido. Revisa el archivo desde LUMEN en la computadora."
                .to_owned()
        };
        Self(StatusCode::BAD_REQUEST, message)
    }
}
impl IntoResponse for Failure {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error": self.1}))).into_response()
    }
}
pub(super) fn secure(mut response: Response) -> Response {
    for (name, value) in [
        ("cache-control", "no-store"),
        ("x-content-type-options", "nosniff"),
        ("referrer-policy", "no-referrer"),
        ("x-frame-options", "DENY"),
        (
            "content-security-policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'",
        ),
    ] {
        response
            .headers_mut()
            .insert(name, HeaderValue::from_static(value));
    }
    response
}

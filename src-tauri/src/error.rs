use std::fmt::Display;

#[derive(Debug, thiserror::Error)]
#[error("{message}")]
pub struct Error {
    pub code: String,
    pub message: String,
}

pub type Result<T> = std::result::Result<T, Error>;

impl Error {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_owned(),
            message: message.into(),
        }
    }

    pub fn message(message: impl Into<String>) -> Self {
        Self::new("internal", message)
    }

    pub fn cancelled() -> Self {
        Self::new("cancelled", "Preparación cancelada.")
    }

    pub fn is_cancelled(&self) -> bool {
        self.code == "cancelled"
    }

    pub fn external(code: &str, error: impl Display) -> Self {
        Self::new(code, error.to_string())
    }
}

macro_rules! convert_error {
    ($source:ty, $code:literal) => {
        impl From<$source> for Error {
            fn from(error: $source) -> Self {
                Self::external($code, error)
            }
        }
    };
}

convert_error!(std::io::Error, "filesystem");
convert_error!(serde_json::Error, "format");
convert_error!(rusqlite::Error, "database");
convert_error!(reqwest::Error, "network");
convert_error!(tauri::Error, "window");

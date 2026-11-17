use crate::error::{Error, Result};
use serde::Serialize;
use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

#[derive(Clone, Serialize)]
pub struct StartupInfo {
    pub supported: bool,
    pub enabled: bool,
    pub error: Option<String>,
}

#[derive(Default, Debug, PartialEq)]
pub struct LaunchOptions {
    pub minimized: bool,
    pub profile: Option<PathBuf>,
}

fn parse_args(args: impl IntoIterator<Item = OsString>) -> Result<LaunchOptions> {
    let mut options = LaunchOptions::default();
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        if arg == "--autostart" {
            options.minimized = true;
        } else if arg == "--profile" {
            let path = args
                .next()
                .map(PathBuf::from)
                .filter(|path| path.is_absolute())
                .ok_or_else(|| {
                    Error::new("startup", "El perfil de inicio debe ser una ruta absoluta.")
                })?;
            options.profile = Some(path);
        }
    }
    Ok(options)
}

pub fn launch_options() -> Result<LaunchOptions> {
    parse_args(std::env::args_os().skip(1))
}

#[cfg(windows)]
fn command(executable: &Path, profile: &Path) -> Result<String> {
    fn quote(path: &Path) -> Result<String> {
        let value = path
            .to_str()
            .filter(|value| !value.contains(['"', '\0', '\r', '\n']))
            .ok_or_else(|| {
                Error::new("startup", "La ruta no es válida para iniciar con Windows.")
            })?;
        if !path.is_absolute() {
            return Err(Error::new(
                "startup",
                "La ruta de inicio debe ser absoluta.",
            ));
        }
        let trailing = value.len() - value.trim_end_matches('\\').len();
        Ok(format!("\"{value}{}\"", "\\".repeat(trailing)))
    }
    let value = format!(
        "{} --autostart --profile {}",
        quote(executable)?,
        quote(profile)?
    );
    if value.encode_utf16().count() > 260 {
        return Err(Error::new(
            "startup",
            "La ruta es demasiado larga para el inicio de Windows. Instala LUMEN en una ruta más corta.",
        ));
    }
    Ok(value)
}

#[cfg(windows)]
fn registry_path() -> Result<String> {
    #[cfg(debug_assertions)]
    if let Some(path) = std::env::var_os("LUMEN_E2E_STARTUP_KEY") {
        let value = path.to_string_lossy();
        if value
            .strip_prefix("Software\\LUMEN\\Tests\\Startup\\")
            .is_some_and(|suffix| {
                !suffix.is_empty()
                    && suffix
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '-')
            })
        {
            return Ok(value.into_owned());
        }
        return Err(Error::new(
            "startup",
            "Destino de prueba de inicio no válido.",
        ));
    }
    Ok("Software\\Microsoft\\Windows\\CurrentVersion\\Run".into())
}

#[cfg(windows)]
fn read_at(path: &str) -> std::io::Result<bool> {
    use winreg::{RegKey, enums::*};
    let key = match RegKey::predef(HKEY_CURRENT_USER).open_subkey(path) {
        Ok(key) => key,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error),
    };
    match key.get_value::<String, _>("LUMEN") {
        Ok(value) => Ok(!value.is_empty()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

#[cfg(windows)]
fn write_at(path: &str, value: Option<&str>) -> std::io::Result<()> {
    use winreg::{RegKey, enums::*};
    let root = RegKey::predef(HKEY_CURRENT_USER);
    if let Some(value) = value {
        let (key, _) = root.create_subkey(path)?;
        key.set_value("LUMEN", &value)
    } else {
        let key = match root.open_subkey_with_flags(path, KEY_SET_VALUE) {
            Ok(key) => key,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error),
        };
        match key.delete_value("LUMEN") {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            result => result,
        }
    }
}

pub fn info() -> StartupInfo {
    #[cfg(windows)]
    let result = registry_path()
        .and_then(|path| read_at(&path).map_err(|error| Error::external("startup", error)));
    #[cfg(not(windows))]
    let result: Result<bool> = Ok(false);
    match result {
        Ok(enabled) => StartupInfo {
            supported: cfg!(windows),
            enabled,
            error: None,
        },
        Err(error) => StartupInfo {
            supported: cfg!(windows),
            enabled: false,
            error: Some(error.message),
        },
    }
}

pub fn set_enabled(enabled: bool, profile: &Path) -> Result<()> {
    #[cfg(windows)]
    {
        let value = if enabled {
            Some(command(&std::env::current_exe()?, profile)?)
        } else {
            None
        };
        write_at(&registry_path()?, value.as_deref())
            .map_err(|error| Error::external("startup", error))
    }
    #[cfg(not(windows))]
    {
        let _ = (enabled, profile);
        Err(Error::new(
            "startup",
            "El inicio automático solo está disponible en Windows.",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manual_launch_stays_visible_and_startup_retains_profile() {
        assert_eq!(parse_args(Vec::new()).unwrap(), LaunchOptions::default());
        let profile = std::env::temp_dir().join("LUMEN profile ñ");
        let args = vec![
            "--autostart".into(),
            "--profile".into(),
            profile.as_os_str().to_owned(),
        ];
        assert_eq!(
            parse_args(args).unwrap(),
            LaunchOptions {
                minimized: true,
                profile: Some(profile)
            }
        );
        assert!(parse_args(vec!["--profile".into()]).is_err());
        assert!(parse_args(vec!["--profile".into(), "relative".into()]).is_err());
    }

    #[test]
    #[cfg(windows)]
    fn startup_command_quotes_paths_without_a_shell() {
        let exe = Path::new("C:\\Program Files\\LUMEN\\LUMEN.exe");
        assert_eq!(
            command(exe, Path::new("C:\\Users\\Prueba ñ\\")).unwrap(),
            "\"C:\\Program Files\\LUMEN\\LUMEN.exe\" --autostart --profile \"C:\\Users\\Prueba ñ\\\\\""
        );
        assert!(command(exe, Path::new(&format!("C:\\{}", "a".repeat(260)))).is_err());
    }

    #[test]
    #[cfg(windows)]
    fn startup_registration_is_reversible_and_preserves_other_values() {
        use winreg::{RegKey, enums::*};
        let path = format!("Software\\LUMEN\\Tests\\Startup\\{}", uuid::Uuid::new_v4());
        let root = RegKey::predef(HKEY_CURRENT_USER);
        let cleanup = scopeguard::guard((), |_| {
            let _ = root.delete_subkey_all(&path);
        });
        assert!(!read_at(&path).unwrap());
        let (key, _) = root.create_subkey(&path).unwrap();
        key.set_value("OtherApp", &"unchanged").unwrap();
        write_at(&path, Some("\"C:\\LUMEN.exe\" --autostart")).unwrap();
        assert!(read_at(&path).unwrap());
        write_at(&path, None).unwrap();
        write_at(&path, None).unwrap();
        assert!(!read_at(&path).unwrap());
        assert_eq!(key.get_value::<String, _>("OtherApp").unwrap(), "unchanged");
        drop(cleanup);
    }
}

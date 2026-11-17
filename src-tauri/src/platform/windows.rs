use crate::{
    core::Core,
    error::{Error, Result},
    models::Display,
};
use sha2::{Digest, Sha256};
use std::{sync::Arc, time::Duration};
use tauri::{AppHandle, Manager, Monitor, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

fn monitor_id(monitor: &Monitor) -> i64 {
    let name = monitor
        .name()
        .cloned()
        .unwrap_or_else(|| format!("{},{}", monitor.position().x, monitor.position().y));
    let hash = Sha256::digest(name.as_bytes());
    i64::from(u32::from_le_bytes([hash[0], hash[1], hash[2], hash[3]]))
}

pub fn displays(app: &AppHandle) -> Result<Vec<Display>> {
    let primary = app.primary_monitor()?;
    Ok(app
        .available_monitors()?
        .iter()
        .enumerate()
        .map(|(index, monitor)| Display {
            id: monitor_id(monitor),
            label: monitor
                .name()
                .cloned()
                .unwrap_or_else(|| format!("Pantalla {}", index + 1)),
            width: monitor.size().width,
            height: monitor.size().height,
            primary: primary
                .as_ref()
                .is_some_and(|item| monitor_id(item) == monitor_id(monitor)),
        })
        .collect())
}

fn browser_arguments() -> String {
    let inherited = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
    format!("{inherited} --autoplay-policy=no-user-gesture-required")
}

pub fn create_main(app: &AppHandle, profile: &std::path::Path) -> Result<WebviewWindow> {
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("LUMEN · Biblia e Himnario Adventista")
        .inner_size(1500.0, 960.0)
        .min_inner_size(960.0, 680.0)
        .visible(false)
        .data_directory(profile.join("webview2"));
    #[cfg(windows)]
    {
        builder = builder.additional_browser_args(&browser_arguments());
    }
    Ok(builder.build()?)
}

pub async fn open_output(app: &AppHandle, id: i64) -> Result<()> {
    let monitor = app
        .available_monitors()?
        .into_iter()
        .find(|monitor| monitor_id(monitor) == id)
        .ok_or_else(|| Error::new("display", "La pantalla seleccionada ya no está conectada."))?;
    let window = if let Some(window) = app.get_webview_window("projection") {
        window.set_fullscreen(false)?;
        window
    } else {
        let profile = super::paths(app)?.profile;
        let mut builder = WebviewWindowBuilder::new(
            app,
            "projection",
            WebviewUrl::App("index.html?output=1".into()),
        )
        .title("LUMEN · Proyección")
        .decorations(false)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .resizable(false)
        .data_directory(profile.join("webview2"));
        #[cfg(windows)]
        {
            builder = builder.additional_browser_args(&browser_arguments());
        }
        builder.build()?
    };
    window.set_position(*monitor.position())?;
    window.set_size(*monitor.size())?;
    window.set_fullscreen(true)?;
    window.show()?;
    if let Some(operator) = app.get_webview_window("main") {
        operator.set_focus()?;
    }
    Ok(())
}

pub fn close_output(app: &AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window("projection") {
        window.close()?;
    }
    Ok(())
}

pub fn watch_displays(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut previous = displays(&app)
            .ok()
            .and_then(|list| serde_json::to_string(&list).ok());
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;
            if app.get_webview_window("main").is_none() {
                break;
            }
            let Ok(current) = displays(&app) else {
                continue;
            };
            let signature = serde_json::to_string(&current).ok();
            if signature == previous {
                continue;
            }
            previous = signature;
            if let Some(core) = app.try_state::<Arc<Core>>() {
                if let Ok(snapshot) = core.snapshot() {
                    if snapshot
                        .output
                        .display_id
                        .is_some_and(|id| !current.iter().any(|display| display.id == id))
                    {
                        if let Err(error) = close_output(&app) {
                            core.status(&error.message);
                        }
                    }
                }
                core.broadcast();
            }
        }
    });
}

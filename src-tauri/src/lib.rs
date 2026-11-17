//! Native desktop runtime for LUMEN.
mod core;
mod data;
pub mod error;
mod media;
mod models;
mod platform;
mod remote;
mod updates;

use crate::{core::Core, data::Store, media::MediaService, models::Action, updates::UpdateService};
use std::sync::Arc;
use tauri::{Manager, State, WebviewWindow, WindowEvent};

#[tauri::command]
async fn lumen_action(
    window: WebviewWindow,
    state: State<'_, Arc<Core>>,
    action: Action,
) -> std::result::Result<serde_json::Value, String> {
    let core = Arc::clone(state.inner());
    let source = window.label().to_owned();
    Ok(match core.action(action, &source).await {
        Ok(data) => serde_json::json!({"ok": true, "data": data}),
        Err(error) => serde_json::json!({"ok": false, "error": error.message}),
    })
}

pub fn run() {
    let application = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![lumen_action])
        .setup(|app| {
            let handle = app.handle().clone();
            let paths = platform::paths(&handle)?;
            let store = Store::open(&paths.profile, &paths.resources)?;
            let extension = if cfg!(windows) { ".exe" } else { "" };
            let media = MediaService::new(
                paths.tools.join(format!("ffmpeg{extension}")),
                paths.tools.join(format!("ffprobe{extension}")),
                paths.profile.join("media-cache"),
            )?;
            tauri::async_runtime::block_on(media.start())?;
            let updates = UpdateService::new(handle.clone(), &paths.profile);
            let core = Core::new(handle.clone(), store, media, updates);
            core.attach_remote(paths.remote);
            app.manage(Arc::clone(&core));
            let main = platform::create_main(&handle, &paths.profile)?;
            if std::env::var("LUMEN_HEADLESS").as_deref() != Ok("1") {
                if platform::startup::launch_options()?.minimized {
                    main.minimize()?;
                }
                main.show()?;
            }
            platform::watch_displays(handle);
            if !cfg!(debug_assertions)
                && std::env::var("LUMEN_HEADLESS").as_deref() != Ok("1")
                && core.updates.snapshot().check_at_startup
            {
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                    if let Err(error) = core.updates.check().await {
                        core.status(&error.message);
                    }
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                if let Some(core) = window.app_handle().try_state::<Arc<Core>>() {
                    match window.label() {
                        "projection" => core.output_closed(),
                        "main" => {
                            core.shutdown();
                            window.app_handle().exit(0);
                        }
                        _ => {}
                    }
                }
            }
        });
    if let Err(error) = application.run(tauri::generate_context!()) {
        eprintln!("lumen.start.failed: {error}");
        std::process::exit(1);
    }
}

mod log_parser;
mod model;
mod ocr;
mod overlay;
mod parser;
mod quest_log;
mod quest_progress;
mod settings_store;
mod sharing;
mod watcher;

use model::{LocatorSnapshotPayload, Settings};
use overlay::{
    get_overlay_state, hide_overlay, hide_overlay_internal, overlay_ready, reset_overlay_window,
    set_overlay_click_through, set_overlay_state, show_overlay, show_overlay_internal,
    toggle_overlay, OverlayRuntimeState,
};
use quest_progress::{
    confirm_quest_sync, dismiss_quest_sync_preview, get_quest_profiles, get_quest_progress,
    get_quest_sync_preview, set_quest_player_level, set_quest_progress, set_quest_sync_enabled,
    sync_quest_progress,
};
use std::path::PathBuf;
use std::sync::{mpsc, Arc, Mutex, RwLock};
use tauri::{Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use watcher::{spawn_locator, ControlMessage};

pub struct AppState {
    settings: Arc<RwLock<Settings>>,
    settings_path: PathBuf,
    control: mpsc::Sender<ControlMessage>,
    settings_write: Mutex<()>,
    progress: Mutex<rusqlite::Connection>,
    share_server: Mutex<Option<sharing::ShareServer>>,
    overlay: Mutex<OverlayRuntimeState>,
    locator_snapshot: Arc<RwLock<LocatorSnapshotPayload>>,
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Settings {
    state
        .settings
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

#[tauri::command]
fn update_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<Settings, String> {
    settings.validate()?;
    let _write_guard = state
        .settings_write
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let previous = state
        .settings
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    settings_store::save(&state.settings_path, &settings)?;
    *state
        .settings
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = settings.clone();
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_always_on_top(settings.always_on_top)
            .map_err(|error| error.to_string())?;
    }
    let _ = app.emit("locator://settings-changed", &settings);
    if previous.screenshots_dir != settings.screenshots_dir
        || previous.logs_dir != settings.logs_dir
        || previous.delete_parsed_screenshots != settings.delete_parsed_screenshots
    {
        let _ = state.control.send(ControlMessage::Rescan);
    }
    Ok(settings)
}

#[tauri::command]
async fn choose_directory(kind: String, state: State<'_, AppState>) -> Result<Settings, String> {
    let selected = tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder())
        .await
        .map_err(|error| error.to_string())?;
    let Some(path) = selected else {
        return Ok(state
            .settings
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone());
    };
    let mut settings = state
        .settings
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    match kind.as_str() {
        "screenshots" => settings.screenshots_dir = Some(path),
        "logs" => settings.logs_dir = Some(path),
        _ => return Err("Unknown directory type".into()),
    }
    let _write_guard = state
        .settings_write
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    settings_store::save(&state.settings_path, &settings)?;
    *state
        .settings
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = settings.clone();
    let _ = state.control.send(ControlMessage::Rescan);
    Ok(settings)
}

#[tauri::command]
fn rescan_directories(state: State<'_, AppState>) {
    let _ = state.control.send(ControlMessage::Rescan);
}

#[tauri::command]
fn read_latest_screenshot(state: State<'_, AppState>) {
    let _ = state.control.send(ControlMessage::ReadLatest);
}

#[tauri::command]
fn open_directory(kind: String, state: State<'_, AppState>) -> Result<(), String> {
    let settings = state
        .settings
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    let path = match kind.as_str() {
        "screenshots" => settings.screenshots_dir,
        "logs" => settings.logs_dir,
        _ => return Err("Unknown directory type".into()),
    }
    .ok_or_else(|| "Folder is not configured".to_string())?;
    if !path.is_dir() {
        return Err("Configured folder is unavailable".into());
    }
    #[cfg(windows)]
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn clear_player_position(app: tauri::AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        state
            .locator_snapshot
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .fix = None;
    }
    let _ = app.emit("locator://clear-position", ());
}

#[tauri::command]
fn get_locator_snapshot(state: State<'_, AppState>) -> LocatorSnapshotPayload {
    state
        .locator_snapshot
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::SIZE,
                )
                .build(),
        )
        .setup(|app| {
            let settings_path = app.path().app_config_dir()?.join("settings.json");
            let settings = Arc::new(RwLock::new(settings_store::load(&settings_path)));
            let progress_path = app.path().app_config_dir()?.join("profiles.sqlite3");
            if let Some(parent) = progress_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let progress = rusqlite::Connection::open(progress_path)?;
            quest_progress::initialize(&progress)?;
            if let Some(window) = app.get_webview_window("main") {
                let pin = settings
                    .read()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .always_on_top;
                window.set_always_on_top(pin)?;
            }
            let locator_snapshot = Arc::new(RwLock::new(LocatorSnapshotPayload::default()));
            let control = spawn_locator(
                app.handle().clone(),
                settings.clone(),
                locator_snapshot.clone(),
            );
            app.manage(AppState {
                settings,
                settings_path,
                control,
                settings_write: Mutex::new(()),
                progress: Mutex::new(progress),
                share_server: Mutex::new(None),
                overlay: Mutex::new(OverlayRuntimeState::default()),
                locator_snapshot,
            });
            let toggle_shortcut =
                app.global_shortcut()
                    .on_shortcut("Ctrl+Shift+M", |app, _shortcut, event| {
                        if event.state() == ShortcutState::Pressed {
                            let visible = app
                                .get_webview_window("overlay")
                                .and_then(|window| window.is_visible().ok())
                                .unwrap_or(false);
                            if let Err(error) = if visible {
                                hide_overlay_internal(app)
                            } else {
                                show_overlay_internal(app)
                            } {
                                set_overlay_state(app, |state| {
                                    state.last_error =
                                        Some(format!("Overlay shortcut failed: {error}"));
                                });
                            }
                        }
                    });
            let recovery_shortcut =
                app.global_shortcut()
                    .on_shortcut("Ctrl+Shift+X", |app, _shortcut, event| {
                        if event.state() == ShortcutState::Pressed {
                            if let Err(error) = show_overlay_internal(app) {
                                set_overlay_state(app, |state| {
                                    state.last_error =
                                        Some(format!("Overlay recovery shortcut failed: {error}"));
                                });
                            }
                        }
                    });
            match (toggle_shortcut, recovery_shortcut) {
                (Ok(()), Ok(())) => set_overlay_state(app.handle(), |state| {
                    state.shortcut_ready = true;
                    state.last_error = None;
                }),
                (toggle, recovery) => {
                    let message = format!(
                        "Global overlay shortcuts unavailable: toggle={}, recovery={}",
                        toggle
                            .err()
                            .map(|error| error.to_string())
                            .unwrap_or_else(|| "ok".into()),
                        recovery
                            .err()
                            .map(|error| error.to_string())
                            .unwrap_or_else(|| "ok".into()),
                    );
                    set_overlay_state(app.handle(), |state| {
                        state.shortcut_ready = false;
                        state.last_error = Some(message);
                    });
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            update_settings,
            choose_directory,
            rescan_directories,
            read_latest_screenshot,
            open_directory,
            get_quest_progress,
            set_quest_progress,
            get_quest_sync_preview,
            dismiss_quest_sync_preview,
            confirm_quest_sync,
            sync_quest_progress,
            get_quest_profiles,
            set_quest_player_level,
            set_quest_sync_enabled,
            toggle_overlay,
            show_overlay,
            hide_overlay,
            get_overlay_state,
            overlay_ready,
            reset_overlay_window,
            set_overlay_click_through,
            sharing::start_lan_share,
            sharing::stop_lan_share,
            clear_player_position,
            get_locator_snapshot
        ])
        .on_window_event(|window, event| {
            if window.label() == "overlay" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = hide_overlay_internal(window.app_handle());
                }
            }
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(state) = window.try_state::<AppState>() {
                    let _ = state.control.send(ControlMessage::Stop);
                }
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Raid Signal");
}

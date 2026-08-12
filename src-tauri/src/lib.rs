mod log_parser;
mod model;
mod ocr;
mod parser;
mod sharing;
mod watcher;

use model::Settings;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, Mutex, RwLock};
use tauri::{Emitter, Manager, State};
use watcher::{spawn_locator, ControlMessage};

pub struct AppState {
    settings: Arc<RwLock<Settings>>,
    settings_path: PathBuf,
    control: mpsc::Sender<ControlMessage>,
    settings_write: Mutex<()>,
    progress: Mutex<rusqlite::Connection>,
    share_server: Mutex<Option<sharing::ShareServer>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct QuestProgressPayload {
    task_id: String,
    status: String,
    updated_at: u64,
}

fn load_settings(path: &Path) -> Settings {
    let parse = |candidate: &Path| {
        std::fs::read_to_string(candidate)
            .ok()
            .and_then(|json| serde_json::from_str(&json).ok())
    };
    parse(path)
        .or_else(|| parse(&path.with_extension("json.bak")))
        .unwrap_or_default()
}

fn save_settings(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    {
        use std::io::Write;
        let mut file = std::fs::File::create(&temporary).map_err(|error| error.to_string())?;
        file.write_all(json.as_bytes())
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
    }
    if path.exists() {
        std::fs::copy(path, &backup).map_err(|error| error.to_string())?;
        std::fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    std::fs::rename(&temporary, path).map_err(|error| error.to_string())
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
    let _write_guard = state
        .settings_write
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let previous = state
        .settings
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    save_settings(&state.settings_path, &settings)?;
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
    save_settings(&state.settings_path, &settings)?;
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
    let _ = app.emit("locator://clear-position", ());
}

#[tauri::command]
fn toggle_overlay(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        let visible = window.is_visible().map_err(|error| error.to_string())?;
        if visible {
            window.hide().map_err(|error| error.to_string())?;
        } else {
            window.show().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
        }
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        "overlay",
        tauri::WebviewUrl::App("index.html?overlay=1".into()),
    )
    .title("Tarkov Locator Overlay")
    .inner_size(430.0, 430.0)
    .min_inner_size(300.0, 300.0)
    .resizable(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(false)
    .build()
    .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_overlay_click_through(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| "Overlay is not open".to_string())?;
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_quest_progress(
    game_mode: String,
    state: State<'_, AppState>,
) -> Result<Vec<QuestProgressPayload>, String> {
    let connection = state
        .progress
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut statement = connection
        .prepare("SELECT task_id, status, updated_at FROM quest_progress WHERE game_mode = ?1 ORDER BY updated_at DESC")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([game_mode], |row| {
            Ok(QuestProgressPayload {
                task_id: row.get(0)?,
                status: row.get(1)?,
                updated_at: row.get::<_, i64>(2)? as u64,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_quest_progress(
    game_mode: String,
    task_id: String,
    status: String,
    state: State<'_, AppState>,
) -> Result<QuestProgressPayload, String> {
    if !matches!(
        status.as_str(),
        "locked" | "available" | "active" | "completed" | "failed"
    ) {
        return Err("Invalid quest status".into());
    }
    let updated_at = std::time::SystemTime::now()
        .duration_since(std::time::SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let connection = state
        .progress
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    connection
        .execute(
            "INSERT INTO quest_progress (game_mode, task_id, status, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(game_mode, task_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at",
            rusqlite::params![game_mode, task_id, status, updated_at as i64],
        )
        .map_err(|error| error.to_string())?;
    Ok(QuestProgressPayload {
        task_id,
        status,
        updated_at,
    })
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
            let settings = Arc::new(RwLock::new(load_settings(&settings_path)));
            let progress_path = app.path().app_config_dir()?.join("profiles.sqlite3");
            if let Some(parent) = progress_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let progress = rusqlite::Connection::open(progress_path)?;
            progress.execute_batch(
                "PRAGMA journal_mode=WAL;
                 CREATE TABLE IF NOT EXISTS quest_progress (
                   game_mode TEXT NOT NULL,
                   task_id TEXT NOT NULL,
                   status TEXT NOT NULL,
                   updated_at INTEGER NOT NULL,
                   PRIMARY KEY (game_mode, task_id)
                 );",
            )?;
            if let Some(window) = app.get_webview_window("main") {
                let pin = settings
                    .read()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .always_on_top;
                window.set_always_on_top(pin)?;
            }
            let control = spawn_locator(app.handle().clone(), settings.clone());
            app.manage(AppState {
                settings,
                settings_path,
                control,
                settings_write: Mutex::new(()),
                progress: Mutex::new(progress),
                share_server: Mutex::new(None),
            });
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
            toggle_overlay,
            set_overlay_click_through,
            sharing::start_lan_share,
            sharing::stop_lan_share,
            clear_player_position
        ])
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(state) = window.try_state::<AppState>() {
                    let _ = state.control.send(ControlMessage::Stop);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Tarkov Map Locator");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_write_keeps_a_recoverable_backup() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("settings.json");
        let mut first = Settings::default();
        first.selected_map = "woods".into();
        save_settings(&path, &first).unwrap();
        let mut second = first.clone();
        second.selected_map = "customs".into();
        save_settings(&path, &second).unwrap();
        std::fs::write(&path, "not json").unwrap();
        assert_eq!(load_settings(&path).selected_map, "woods");
    }
}

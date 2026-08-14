use crate::AppState;
use tauri::{Emitter, Manager};

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OverlayRuntimeState {
    pub(crate) visible: bool,
    pub(crate) ready: bool,
    pub(crate) click_through: bool,
    pub(crate) shortcut_ready: bool,
    pub(crate) last_error: Option<String>,
}

pub(crate) fn overlay_state(app: &tauri::AppHandle) -> OverlayRuntimeState {
    app.try_state::<AppState>()
        .map(|state| {
            let mut overlay = state
                .overlay
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .clone();
            if let Some(window) = app.get_webview_window("overlay") {
                overlay.visible = window.is_visible().unwrap_or(false);
            } else {
                overlay.visible = false;
                overlay.ready = false;
                overlay.click_through = false;
            }
            *state
                .overlay
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = overlay.clone();
            overlay
        })
        .unwrap_or_default()
}

pub(crate) fn set_overlay_state(
    app: &tauri::AppHandle,
    update: impl FnOnce(&mut OverlayRuntimeState),
) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let next = {
        let mut overlay = state
            .overlay
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        update(&mut overlay);
        overlay.clone()
    };
    let _ = app.emit("overlay://state-changed", next);
}

fn create_overlay(app: &tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("overlay")
        .map(|_| ())
        .ok_or_else(|| "The preloaded overlay window is unavailable; restart Raid Signal".into())
}

pub(crate) fn show_overlay_internal(app: &tauri::AppHandle) -> Result<(), String> {
    let result: Result<(), String> = (|| {
        create_overlay(app)?;
        let window = app
            .get_webview_window("overlay")
            .ok_or_else(|| "Overlay window was not created".to_string())?;
        window
            .set_ignore_cursor_events(false)
            .map_err(|error| error.to_string())?;
        window
            .set_always_on_top(true)
            .map_err(|error| error.to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        Ok(())
    })();
    match result {
        Ok(()) => {
            set_overlay_state(app, |state| {
                state.visible = true;
                state.click_through = false;
                state.last_error = None;
            });
            Ok(())
        }
        Err(error) => {
            set_overlay_state(app, |state| state.last_error = Some(error.clone()));
            Err(error)
        }
    }
}

pub(crate) fn hide_overlay_internal(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("overlay") {
        window
            .set_ignore_cursor_events(false)
            .map_err(|error| error.to_string())?;
        window.hide().map_err(|error| error.to_string())?;
    }
    set_overlay_state(app, |state| {
        state.visible = false;
        state.click_through = false;
        state.last_error = None;
    });
    Ok(())
}

#[tauri::command]
pub(crate) fn show_overlay(app: tauri::AppHandle) -> Result<(), String> {
    show_overlay_internal(&app)
}

#[tauri::command]
pub(crate) fn hide_overlay(app: tauri::AppHandle) -> Result<(), String> {
    hide_overlay_internal(&app)
}

#[tauri::command]
pub(crate) fn toggle_overlay(app: tauri::AppHandle) -> Result<(), String> {
    let visible = app
        .get_webview_window("overlay")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false);
    if visible {
        hide_overlay_internal(&app)
    } else {
        show_overlay_internal(&app)
    }
}

#[tauri::command]
pub(crate) fn get_overlay_state(app: tauri::AppHandle) -> OverlayRuntimeState {
    overlay_state(&app)
}

#[tauri::command]
pub(crate) fn overlay_ready(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| "Overlay is not open".to_string())?;
    let visible = window.is_visible().map_err(|error| error.to_string())?;
    set_overlay_state(&app, |state| {
        state.visible = visible;
        state.ready = true;
        state.last_error = None;
    });
    let _ = app.emit("overlay://invalidate-map", ());
    Ok(())
}

#[tauri::command]
pub(crate) fn set_overlay_click_through(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<(), String> {
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| "Overlay is not open".to_string())?;
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|error| error.to_string())?;
    let visible = window.is_visible().map_err(|error| error.to_string())?;
    if !enabled && visible {
        window.set_focus().map_err(|error| error.to_string())?;
    }
    set_overlay_state(&app, |state| {
        state.visible = visible;
        state.click_through = enabled;
        state.last_error = None;
    });
    Ok(())
}

#[tauri::command]
pub(crate) fn reset_overlay_window(app: tauri::AppHandle) -> Result<(), String> {
    create_overlay(&app)?;
    let window = app
        .get_webview_window("overlay")
        .ok_or_else(|| "Overlay is not open".to_string())?;
    window
        .set_ignore_cursor_events(false)
        .map_err(|error| error.to_string())?;
    window
        .set_size(tauri::LogicalSize::new(430.0, 430.0))
        .map_err(|error| error.to_string())?;
    window.center().map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    set_overlay_state(&app, |state| {
        state.visible = true;
        state.click_through = false;
        state.last_error = None;
    });
    let _ = app.emit("overlay://invalidate-map", ());
    Ok(())
}

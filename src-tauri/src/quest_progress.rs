use crate::quest_log::{scan_logs, QuestLogProfile, QuestLogScan};
use crate::watcher::resolve_logs_root;
use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, State};

const MODES: [&str; 3] = ["regular", "pve", "pvp-season"];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QuestProgressPayload {
    task_id: String,
    status: String,
    updated_at: u64,
    source: String,
    profile_key: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QuestProfilePayload {
    profile_key: String,
    game_mode: String,
    last_seen: u64,
    is_current: bool,
    player_level: Option<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QuestSyncPreviewPayload {
    available: bool,
    enabled: bool,
    should_review: bool,
    logs_root: Option<String>,
    profiles: Vec<QuestLogProfile>,
    event_count: usize,
    files_scanned: usize,
    malformed_records: usize,
    unattributed_records: usize,
    suspicious_sessions: usize,
    fingerprint: String,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QuestSyncResultPayload {
    imported_events: usize,
    profiles: Vec<QuestProfilePayload>,
    detected_mode: Option<String>,
    enable_quest_markers: bool,
}

pub(crate) fn initialize(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS quest_progress (
           game_mode TEXT NOT NULL,
           task_id TEXT NOT NULL,
           status TEXT NOT NULL,
           updated_at INTEGER NOT NULL,
           PRIMARY KEY (game_mode, task_id)
         );
         CREATE TABLE IF NOT EXISTS quest_profiles (
           profile_key TEXT NOT NULL,
           game_mode TEXT NOT NULL,
           last_seen INTEGER NOT NULL,
           is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
           player_level INTEGER CHECK (player_level IS NULL OR player_level BETWEEN 1 AND 79),
           PRIMARY KEY (profile_key, game_mode)
         );
         CREATE TABLE IF NOT EXISTS quest_events (
           event_key TEXT PRIMARY KEY,
           profile_key TEXT NOT NULL,
           game_mode TEXT NOT NULL,
           task_id TEXT NOT NULL,
           status TEXT NOT NULL,
           source TEXT NOT NULL CHECK (source IN ('logs', 'manual')),
           occurred_at INTEGER NOT NULL,
           session_key TEXT,
           quarantined INTEGER NOT NULL DEFAULT 0 CHECK (quarantined IN (0, 1))
         );
         CREATE INDEX IF NOT EXISTS quest_events_profile_mode_time
           ON quest_events(profile_key, game_mode, task_id, occurred_at DESC);
         CREATE TABLE IF NOT EXISTS quest_sync_state (
           key TEXT PRIMARY KEY,
           value TEXT NOT NULL
         );",
    )
}

#[tauri::command]
pub(crate) fn get_quest_progress(
    game_mode: String,
    profile_key: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<QuestProgressPayload>, String> {
    validate_mode(&game_mode)?;
    if let Some(profile) = profile_key.as_deref() {
        validate_profile_key(profile)?;
    }
    let connection = state
        .progress
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let selected_profile = match profile_key {
        Some(profile) => Some(profile),
        None => current_profile(&connection, &game_mode)?,
    };
    let Some(profile_key) = selected_profile else {
        return legacy_progress(&connection, &game_mode);
    };
    let mut statement = connection
        .prepare(
            "SELECT task_id, status, occurred_at, source FROM (
               SELECT task_id, status, occurred_at, source,
                 ROW_NUMBER() OVER (
                   PARTITION BY task_id ORDER BY occurred_at DESC, rowid DESC
                 ) AS event_rank
               FROM quest_events
               WHERE profile_key = ?1 AND game_mode = ?2 AND quarantined = 0
             ) WHERE event_rank = 1 ORDER BY occurred_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![profile_key, game_mode], |row| {
            Ok(QuestProgressPayload {
                task_id: row.get(0)?,
                status: row.get(1)?,
                updated_at: row.get::<_, i64>(2)?.max(0) as u64,
                source: row.get(3)?,
                profile_key: Some(profile_key.clone()),
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn set_quest_progress(
    game_mode: String,
    task_id: String,
    status: String,
    profile_key: Option<String>,
    state: State<'_, AppState>,
) -> Result<QuestProgressPayload, String> {
    validate_mode(&game_mode)?;
    validate_task_id(&task_id)?;
    validate_status(&status)?;
    if let Some(profile) = profile_key.as_deref() {
        validate_profile_key(profile)?;
    }
    let updated_at = now_millis();
    let connection = state
        .progress
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let selected_profile = match profile_key {
        Some(profile) => Some(profile),
        None => current_profile(&connection, &game_mode)?,
    };
    if let Some(profile_key) = selected_profile {
        if !profile_exists(&connection, &profile_key, &game_mode)? {
            return Err("Quest profile was not found".into());
        }
        let event_key = format!("manual:{profile_key}:{game_mode}:{task_id}:{updated_at}");
        connection
            .execute(
                "INSERT INTO quest_events (
                   event_key, profile_key, game_mode, task_id, status, source, occurred_at,
                   session_key, quarantined
                 ) VALUES (?1, ?2, ?3, ?4, ?5, 'manual', ?6, NULL, 0)
                 ON CONFLICT(event_key) DO UPDATE SET status = excluded.status",
                params![
                    event_key,
                    profile_key,
                    game_mode,
                    task_id,
                    status,
                    updated_at as i64
                ],
            )
            .map_err(|error| error.to_string())?;
        return Ok(QuestProgressPayload {
            task_id,
            status,
            updated_at,
            source: "manual".into(),
            profile_key: Some(profile_key),
        });
    }
    connection
        .execute(
            "INSERT INTO quest_progress (game_mode, task_id, status, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(game_mode, task_id) DO UPDATE SET
               status = excluded.status, updated_at = excluded.updated_at",
            params![game_mode, task_id, status, updated_at as i64],
        )
        .map_err(|error| error.to_string())?;
    Ok(QuestProgressPayload {
        task_id,
        status,
        updated_at,
        source: "manual".into(),
        profile_key: None,
    })
}

#[tauri::command]
pub(crate) async fn get_quest_sync_preview(
    state: State<'_, AppState>,
) -> Result<QuestSyncPreviewPayload, String> {
    let settings = state
        .settings
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    let (reviewed, enabled, dismissed) = {
        let connection = state
            .progress
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        (
            state_value(&connection, "reviewed")?.as_deref() == Some("1"),
            state_value(&connection, "enabled")?.as_deref() == Some("1"),
            state_value(&connection, "dismissed_fingerprint")?,
        )
    };
    let Some(root) = resolve_logs_root(&settings) else {
        return Ok(empty_preview(
            "Waiting for a valid Escape from Tarkov Logs folder",
            enabled,
        ));
    };
    let scan = scan_logs_async(root.clone(), false).await?;
    let should_review = !reviewed
        && !scan.events.is_empty()
        && dismissed.as_deref() != Some(scan.fingerprint.as_str());
    Ok(preview_from_scan(root, scan, should_review, enabled))
}

#[tauri::command]
pub(crate) fn dismiss_quest_sync_preview(
    fingerprint: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    validate_fingerprint(&fingerprint)?;
    let connection = state
        .progress
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    set_state(&connection, "dismissed_fingerprint", &fingerprint)?;
    set_state(&connection, "reviewed", "1")
}

#[tauri::command]
pub(crate) async fn confirm_quest_sync(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<QuestSyncResultPayload, String> {
    let settings = state
        .settings
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    let root = resolve_logs_root(&settings)
        .ok_or_else(|| "A valid Escape from Tarkov Logs folder is required".to_string())?;
    let scan = scan_logs_async(root, false).await?;
    let mut connection = state
        .progress
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let markers_already_enabled =
        state_value(&connection, "markers_enabled_once")?.as_deref() == Some("1");
    let imported_events = apply_scan(&mut connection, &scan, true)?;
    set_state(&connection, "reviewed", "1")?;
    set_state(&connection, "enabled", "1")?;
    set_state(&connection, "markers_enabled_once", "1")?;
    set_state(&connection, "confirmed_fingerprint", &scan.fingerprint)?;
    let profiles = load_profiles(&connection)?;
    let detected_mode = newest_current_mode(&profiles);
    drop(connection);
    let _ = app.emit("quest://progress-changed", ());
    Ok(QuestSyncResultPayload {
        imported_events,
        profiles,
        detected_mode,
        enable_quest_markers: !markers_already_enabled,
    })
}

#[tauri::command]
pub(crate) async fn sync_quest_progress(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<QuestSyncResultPayload, String> {
    let settings = state
        .settings
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    let enabled = {
        let connection = state
            .progress
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state_value(&connection, "enabled")?.as_deref() == Some("1")
    };
    if !enabled {
        let connection = state
            .progress
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        return Ok(QuestSyncResultPayload {
            imported_events: 0,
            profiles: load_profiles(&connection)?,
            detected_mode: None,
            enable_quest_markers: false,
        });
    }
    let Some(root) = resolve_logs_root(&settings) else {
        return Err("The configured Tarkov Logs folder is unavailable".into());
    };
    let scan = scan_logs_async(root, true).await?;
    let mut connection = state
        .progress
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let imported_events = apply_scan(&mut connection, &scan, false)?;
    let profiles = load_profiles(&connection)?;
    let detected_mode = newest_current_mode(&profiles);
    drop(connection);
    if imported_events > 0 {
        let _ = app.emit("quest://progress-changed", ());
    }
    Ok(QuestSyncResultPayload {
        imported_events,
        profiles,
        detected_mode,
        enable_quest_markers: false,
    })
}

#[tauri::command]
pub(crate) fn set_quest_sync_enabled(
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let connection = state
        .progress
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if enabled && state_value(&connection, "reviewed")?.as_deref() != Some("1") {
        return Err("Review the quest log import before enabling automatic sync".into());
    }
    set_state(&connection, "enabled", if enabled { "1" } else { "0" })
}

#[tauri::command]
pub(crate) fn get_quest_profiles(
    state: State<'_, AppState>,
) -> Result<Vec<QuestProfilePayload>, String> {
    let connection = state
        .progress
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    load_profiles(&connection)
}

#[tauri::command]
pub(crate) fn set_quest_player_level(
    game_mode: String,
    profile_key: String,
    player_level: Option<u8>,
    state: State<'_, AppState>,
) -> Result<QuestProfilePayload, String> {
    validate_mode(&game_mode)?;
    validate_profile_key(&profile_key)?;
    if player_level.is_some_and(|level| !(1..=79).contains(&level)) {
        return Err("Player level must be between 1 and 79".into());
    }
    let connection = state
        .progress
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let changed = connection
        .execute(
            "UPDATE quest_profiles SET player_level = ?1
             WHERE profile_key = ?2 AND game_mode = ?3",
            params![player_level, profile_key, game_mode],
        )
        .map_err(|error| error.to_string())?;
    if changed == 0 {
        return Err("Quest profile was not found".into());
    }
    load_profiles(&connection)?
        .into_iter()
        .find(|profile| profile.profile_key == profile_key && profile.game_mode == game_mode)
        .ok_or_else(|| "Quest profile was not found".into())
}

fn apply_scan(
    connection: &mut Connection,
    scan: &QuestLogScan,
    migrate_legacy: bool,
) -> Result<usize, String> {
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    upsert_profiles(&transaction, &scan.profiles)?;
    if migrate_legacy {
        migrate_legacy_progress(&transaction, &scan.profiles)?;
    }
    let mut imported = 0;
    for event in &scan.events {
        imported += transaction
            .execute(
                "INSERT OR IGNORE INTO quest_events (
                   event_key, profile_key, game_mode, task_id, status, source, occurred_at,
                   session_key, quarantined
                 ) VALUES (?1, ?2, ?3, ?4, ?5, 'logs', ?6, ?7, ?8)",
                params![
                    event.event_key,
                    event.profile_key,
                    event.game_mode,
                    event.task_id,
                    event.status,
                    event.occurred_at,
                    event.session_key,
                    i64::from(event.quarantined)
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(imported)
}

async fn scan_logs_async(
    root: std::path::PathBuf,
    latest_only: bool,
) -> Result<QuestLogScan, String> {
    tauri::async_runtime::spawn_blocking(move || scan_logs(&root, latest_only))
        .await
        .map_err(|error| format!("Quest log scan could not finish: {error}"))?
}

fn upsert_profiles(
    transaction: &Transaction<'_>,
    profiles: &[QuestLogProfile],
) -> Result<(), String> {
    for mode in MODES {
        if profiles.iter().any(|profile| profile.game_mode == mode) {
            transaction
                .execute(
                    "UPDATE quest_profiles SET is_current = 0 WHERE game_mode = ?1",
                    [mode],
                )
                .map_err(|error| error.to_string())?;
        }
    }
    for profile in profiles {
        transaction
            .execute(
                "INSERT INTO quest_profiles (profile_key, game_mode, last_seen, is_current)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(profile_key, game_mode) DO UPDATE SET
                   last_seen = MAX(last_seen, excluded.last_seen), is_current = excluded.is_current",
                params![profile.profile_key, profile.game_mode, profile.last_seen, i64::from(profile.is_current)],
            )
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn migrate_legacy_progress(
    transaction: &Transaction<'_>,
    profiles: &[QuestLogProfile],
) -> Result<(), String> {
    for profile in profiles.iter().filter(|profile| profile.is_current) {
        let legacy = {
            let mut statement = transaction
                .prepare(
                    "SELECT task_id, status, updated_at FROM quest_progress WHERE game_mode = ?1",
                )
                .map_err(|error| error.to_string())?;
            let rows = statement
                .query_map([&profile.game_mode], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                })
                .map_err(|error| error.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?;
            rows
        };
        for (task_id, status, updated_at) in legacy {
            let event_key = format!(
                "legacy:{}:{}:{}:{}",
                profile.profile_key, profile.game_mode, task_id, updated_at
            );
            transaction
                .execute(
                    "INSERT OR IGNORE INTO quest_events (
                   event_key, profile_key, game_mode, task_id, status, source, occurred_at,
                   session_key, quarantined
                 ) VALUES (?1, ?2, ?3, ?4, ?5, 'manual', ?6, NULL, 0)",
                    params![
                        event_key,
                        profile.profile_key,
                        profile.game_mode,
                        task_id,
                        status,
                        updated_at
                    ],
                )
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn load_profiles(connection: &Connection) -> Result<Vec<QuestProfilePayload>, String> {
    let mut statement = connection
        .prepare(
            "SELECT profile_key, game_mode, last_seen, is_current, player_level
                  FROM quest_profiles ORDER BY is_current DESC, last_seen DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(QuestProfilePayload {
                profile_key: row.get(0)?,
                game_mode: row.get(1)?,
                last_seen: row.get::<_, i64>(2)?.max(0) as u64,
                is_current: row.get::<_, i64>(3)? != 0,
                player_level: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn legacy_progress(
    connection: &Connection,
    game_mode: &str,
) -> Result<Vec<QuestProgressPayload>, String> {
    let mut statement = connection
        .prepare(
            "SELECT task_id, status, updated_at FROM quest_progress
                  WHERE game_mode = ?1 ORDER BY updated_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([game_mode], |row| {
            Ok(QuestProgressPayload {
                task_id: row.get(0)?,
                status: row.get(1)?,
                updated_at: row.get::<_, i64>(2)?.max(0) as u64,
                source: "manual".into(),
                profile_key: None,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn current_profile(connection: &Connection, game_mode: &str) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT profile_key FROM quest_profiles WHERE game_mode = ?1 AND is_current = 1
         ORDER BY last_seen DESC LIMIT 1",
            [game_mode],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn profile_exists(
    connection: &Connection,
    profile_key: &str,
    game_mode: &str,
) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT 1 FROM quest_profiles WHERE profile_key = ?1 AND game_mode = ?2",
            params![profile_key, game_mode],
            |_| Ok(()),
        )
        .optional()
        .map(|value| value.is_some())
        .map_err(|error| error.to_string())
}

fn state_value(connection: &Connection, key: &str) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT value FROM quest_sync_state WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn set_state(connection: &Connection, key: &str, value: &str) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO quest_sync_state (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn preview_from_scan(
    root: std::path::PathBuf,
    scan: QuestLogScan,
    should_review: bool,
    enabled: bool,
) -> QuestSyncPreviewPayload {
    let available = !scan.events.is_empty();
    let message = if available {
        "Quest events were found. Review the profile and mode summary before importing."
    } else {
        "No supported quest events were found in the available logs."
    };
    QuestSyncPreviewPayload {
        available,
        enabled,
        should_review,
        logs_root: Some(root.to_string_lossy().into_owned()),
        profiles: scan.profiles,
        event_count: scan.events.len(),
        files_scanned: scan.files_scanned,
        malformed_records: scan.malformed_records,
        unattributed_records: scan.unattributed_records,
        suspicious_sessions: scan.suspicious_sessions,
        fingerprint: scan.fingerprint,
        message: message.into(),
    }
}

fn empty_preview(message: &str, enabled: bool) -> QuestSyncPreviewPayload {
    QuestSyncPreviewPayload {
        available: false,
        enabled,
        should_review: false,
        logs_root: None,
        profiles: Vec::new(),
        event_count: 0,
        files_scanned: 0,
        malformed_records: 0,
        unattributed_records: 0,
        suspicious_sessions: 0,
        fingerprint: String::new(),
        message: message.into(),
    }
}

fn newest_current_mode(profiles: &[QuestProfilePayload]) -> Option<String> {
    profiles
        .iter()
        .filter(|profile| profile.is_current)
        .max_by_key(|profile| profile.last_seen)
        .map(|profile| profile.game_mode.clone())
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn validate_mode(game_mode: &str) -> Result<(), String> {
    if MODES.contains(&game_mode) {
        Ok(())
    } else {
        Err("Invalid quest game mode".into())
    }
}

fn validate_status(status: &str) -> Result<(), String> {
    if matches!(
        status,
        "locked" | "available" | "active" | "completed" | "failed"
    ) {
        Ok(())
    } else {
        Err("Invalid quest status".into())
    }
}

fn validate_task_id(task_id: &str) -> Result<(), String> {
    if task_id.len() == 24 && task_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("Invalid quest task id".into())
    }
}

fn validate_profile_key(profile_key: &str) -> Result<(), String> {
    if profile_key.len() == 64 && profile_key.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("Invalid quest profile key".into())
    }
}

fn validate_fingerprint(fingerprint: &str) -> Result<(), String> {
    validate_profile_key(fingerprint).map_err(|_| "Invalid quest scan fingerprint".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quest_log::QuestLogEvent;

    #[test]
    fn database_initialization_is_additive() {
        let connection = Connection::open_in_memory().unwrap();
        initialize(&connection).unwrap();
        initialize(&connection).unwrap();
        assert_eq!(state_value(&connection, "enabled").unwrap(), None);
    }

    #[test]
    fn validates_all_supported_modes() {
        for mode in MODES {
            assert!(validate_mode(mode).is_ok());
        }
        assert!(validate_mode("arena").is_err());
    }

    #[test]
    fn newest_manual_or_log_event_wins_without_cross_profile_leakage() {
        let mut connection = Connection::open_in_memory().unwrap();
        initialize(&connection).unwrap();
        let task_id = "abcdefabcdefabcdefabcdef";
        connection
            .execute(
                "INSERT INTO quest_progress (game_mode, task_id, status, updated_at)
                 VALUES ('regular', ?1, 'active', 2000)",
                [task_id],
            )
            .unwrap();
        let profile = QuestLogProfile {
            profile_key: "a".repeat(64),
            game_mode: "regular".into(),
            last_seen: 1000,
            event_count: 1,
            started_count: 0,
            failed_count: 0,
            completed_count: 1,
            is_current: true,
        };
        let old_scan = QuestLogScan {
            events: vec![QuestLogEvent {
                event_key: "old-log".into(),
                profile_key: profile.profile_key.clone(),
                game_mode: "regular".into(),
                task_id: task_id.into(),
                status: "completed".into(),
                occurred_at: 1000,
                session_key: "session-a".into(),
                quarantined: false,
            }],
            profiles: vec![profile.clone()],
            ..QuestLogScan::default()
        };
        apply_scan(&mut connection, &old_scan, true).unwrap();
        let latest: String = connection
            .query_row(
                "SELECT status FROM quest_events WHERE profile_key = ?1 AND task_id = ?2
                 ORDER BY occurred_at DESC, rowid DESC LIMIT 1",
                params![profile.profile_key, task_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(latest, "active");

        let new_scan = QuestLogScan {
            events: vec![QuestLogEvent {
                event_key: "new-log".into(),
                profile_key: profile.profile_key.clone(),
                game_mode: "regular".into(),
                task_id: task_id.into(),
                status: "completed".into(),
                occurred_at: 3000,
                session_key: "session-b".into(),
                quarantined: false,
            }],
            profiles: vec![QuestLogProfile {
                last_seen: 3000,
                ..profile.clone()
            }],
            ..QuestLogScan::default()
        };
        apply_scan(&mut connection, &new_scan, false).unwrap();
        let latest: String = connection
            .query_row(
                "SELECT status FROM quest_events WHERE profile_key = ?1 AND task_id = ?2
                 ORDER BY occurred_at DESC, rowid DESC LIMIT 1",
                params![profile.profile_key, task_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(latest, "completed");
        assert_eq!(
            connection
                .query_row(
                    "SELECT COUNT(*) FROM quest_events WHERE profile_key = ?1",
                    ["b".repeat(64)],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            0
        );
    }
}

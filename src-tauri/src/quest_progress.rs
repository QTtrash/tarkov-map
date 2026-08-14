use crate::AppState;
use tauri::State;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QuestProgressPayload {
    task_id: String,
    status: String,
    updated_at: u64,
}

#[tauri::command]
pub(crate) fn get_quest_progress(
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
pub(crate) fn set_quest_progress(
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

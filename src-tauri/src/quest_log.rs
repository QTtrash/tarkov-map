use chrono::NaiveDateTime;
use regex::Regex;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

const MAX_JSON_BYTES: usize = 256 * 1024;
const MAX_LINE_BYTES: usize = 256 * 1024;
const MAX_SESSIONS: usize = 128;
const MAX_LOG_FILES_PER_KIND: usize = 32;
const MAX_EVENTS: usize = 100_000;
const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
const SUSPICIOUS_STARTED_THRESHOLD: usize = 20;

static TIMESTAMP: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:[.,](\d{3}))?")
        .expect("valid log timestamp regex")
});
static PROFILE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?:profile(?:id)?\s*[:=]\s*|profile\s+)([a-f0-9]{24})(?:\b|$)")
        .expect("valid profile regex")
});
static MODE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?:session\s+mode|game\s+mode)\s*[:=]\s*(Regular|Pve|PvpSeason)\b")
        .expect("valid mode regex")
});
static TASK_ID: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)\b([a-f0-9]{24})\b").expect("valid task id regex"));

#[derive(Clone, Debug)]
pub(crate) struct QuestLogEvent {
    pub event_key: String,
    pub profile_key: String,
    pub game_mode: String,
    pub task_id: String,
    pub status: String,
    pub occurred_at: i64,
    pub session_key: String,
    pub quarantined: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QuestLogProfile {
    pub profile_key: String,
    pub game_mode: String,
    pub last_seen: i64,
    pub event_count: usize,
    pub started_count: usize,
    pub failed_count: usize,
    pub completed_count: usize,
    pub is_current: bool,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct QuestLogScan {
    pub events: Vec<QuestLogEvent>,
    pub profiles: Vec<QuestLogProfile>,
    pub sessions_scanned: usize,
    pub files_scanned: usize,
    pub notification_files_scanned: usize,
    pub output_files_scanned: usize,
    pub chat_message_markers: usize,
    pub lifecycle_hints: usize,
    pub malformed_records: usize,
    pub unattributed_records: usize,
    pub suspicious_sessions: usize,
    pub fingerprint: String,
}

#[derive(Clone, Debug)]
struct Marker {
    observed_at: i64,
    profile_id: Option<String>,
    game_mode: Option<String>,
}

#[derive(Clone, Debug)]
struct CandidateEvent {
    event_id: Option<String>,
    message_id: Option<String>,
    profile_id: Option<String>,
    observed_at: i64,
    occurred_at: i64,
    task_id: String,
    status: String,
}

pub(crate) fn scan_logs(root: &Path, latest_only: bool) -> Result<QuestLogScan, String> {
    if !root.is_dir() {
        return Err("The configured Tarkov log folder is unavailable".into());
    }
    let sessions = session_folders(root, latest_only)?;
    let mut scan = QuestLogScan::default();
    for session in sessions {
        scan_session(&session, &mut scan);
    }
    finalize_scan(&mut scan);
    Ok(scan)
}

fn session_folders(root: &Path, latest_only: bool) -> Result<Vec<PathBuf>, String> {
    if root
        .file_name()
        .is_some_and(|name| name.to_string_lossy().starts_with("log_"))
    {
        return Ok(vec![root.to_path_buf()]);
    }
    let mut sessions = std::fs::read_dir(root)
        .map_err(|error| format!("Could not read Tarkov logs: {error}"))?
        .flatten()
        .filter(|entry| {
            entry.file_name().to_string_lossy().starts_with("log_")
                && entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false)
        })
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    sessions.sort_by_key(|path| path.file_name().map(|name| name.to_os_string()));
    if latest_only && sessions.len() > 1 {
        sessions.drain(..sessions.len() - 1);
    } else if sessions.len() > MAX_SESSIONS {
        sessions.drain(..sessions.len() - MAX_SESSIONS);
    }
    Ok(sessions)
}

fn scan_session(session: &Path, scan: &mut QuestLogScan) {
    scan.sessions_scanned += 1;
    let session_key = session
        .file_name()
        .map(|name| hash_text(&name.to_string_lossy()))
        .unwrap_or_else(|| hash_text("unknown-session"));
    let Ok(entries) = std::fs::read_dir(session) else {
        return;
    };
    let mut application_files = Vec::new();
    let mut notification_files = Vec::new();
    let mut output_files = Vec::new();
    for path in entries.flatten().map(|entry| entry.path()) {
        if !path.is_file() || !is_log_file(&path) {
            continue;
        }
        let name = path
            .file_name()
            .map(|name| name.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        if name.contains("application") {
            application_files.push(path);
        } else if name.contains("notification") {
            notification_files.push(path);
        } else if name.contains("output") {
            output_files.push(path);
        }
    }
    application_files.sort();
    notification_files.sort();
    output_files.sort();
    application_files.truncate(MAX_LOG_FILES_PER_KIND);
    notification_files.truncate(MAX_LOG_FILES_PER_KIND);
    output_files.truncate(MAX_LOG_FILES_PER_KIND);

    let mut markers = Vec::new();
    for path in application_files
        .iter()
        .chain(notification_files.iter())
        .chain(output_files.iter())
    {
        collect_markers(path, &mut markers);
    }
    markers.sort_by_key(|marker| marker.observed_at);

    let event_start = scan.events.len();
    for path in &notification_files {
        scan.files_scanned += 1;
        scan.notification_files_scanned += 1;
        parse_event_file(path, &markers, &session_key, scan);
    }
    for path in &output_files {
        scan.files_scanned += 1;
        scan.output_files_scanned += 1;
        parse_event_file(path, &markers, &session_key, scan);
    }
    let distinct_started = scan.events[event_start..]
        .iter()
        .filter(|event| event.status == "active")
        .map(|event| event.task_id.as_str())
        .collect::<HashSet<_>>()
        .len();
    if distinct_started > SUSPICIOUS_STARTED_THRESHOLD {
        scan.suspicious_sessions += 1;
        for event in &mut scan.events[event_start..] {
            if event.status == "active" {
                event.quarantined = true;
            }
        }
    }
}

fn is_log_file(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.to_string_lossy().eq_ignore_ascii_case("log"))
}

fn collect_markers(path: &Path, markers: &mut Vec<Marker>) {
    let Ok(file) = File::open(path) else {
        return;
    };
    for_each_bounded_line(
        BufReader::new(file.take(MAX_FILE_BYTES)),
        |line, truncated| {
            if truncated {
                return;
            }
            let observed_at = parse_log_timestamp(line).unwrap_or_default();
            if observed_at == 0 {
                return;
            }
            let profile_id = PROFILE
                .captures(line)
                .and_then(|captures| captures.get(1))
                .map(|value| value.as_str().to_ascii_lowercase());
            let game_mode = MODE
                .captures(line)
                .and_then(|captures| captures.get(1))
                .and_then(|value| normalize_mode(value.as_str()).map(str::to_owned));
            if profile_id.is_some() || game_mode.is_some() {
                markers.push(Marker {
                    observed_at,
                    profile_id,
                    game_mode,
                });
            }
        },
    );
}

fn parse_event_file(path: &Path, markers: &[Marker], session_key: &str, scan: &mut QuestLogScan) {
    let Ok(file) = File::open(path) else {
        return;
    };
    let mut waiting_for_json = false;
    let mut marker_timestamp = 0_i64;
    let mut json = String::new();
    let mut depth = 0_i32;
    let mut in_string = false;
    let mut escaped = false;

    for_each_bounded_line(
        BufReader::new(file.take(MAX_FILE_BYTES)),
        |line, truncated| {
            if scan.events.len() >= MAX_EVENTS {
                return;
            }
            if truncated {
                if waiting_for_json {
                    scan.malformed_records += 1;
                    waiting_for_json = false;
                    json.clear();
                }
                return;
            }
            if [
                "AcceptQuest",
                "SendQuestComplete",
                "SendQuestFail",
                "EFT.Quests.Quest:SetStatus",
            ]
            .iter()
            .any(|hint| line.contains(hint))
            {
                scan.lifecycle_hints += 1;
            }
            if line.contains("ChatMessageReceived") {
                scan.chat_message_markers += 1;
                if waiting_for_json && !json.is_empty() {
                    scan.malformed_records += 1;
                }
                waiting_for_json = true;
                marker_timestamp = parse_log_timestamp(line).unwrap_or_default();
                json.clear();
                depth = 0;
                in_string = false;
                escaped = false;
                return;
            }
            if !waiting_for_json {
                return;
            }
            if json.is_empty() && !line.trim_start().starts_with('{') {
                if parse_log_timestamp(line).is_some() {
                    waiting_for_json = false;
                }
                return;
            }
            if json.len().saturating_add(line.len()) > MAX_JSON_BYTES {
                scan.malformed_records += 1;
                waiting_for_json = false;
                json.clear();
                return;
            }
            json.push_str(line);
            json.push('\n');
            update_json_depth(line, &mut depth, &mut in_string, &mut escaped);
            if depth > 0 {
                return;
            }
            waiting_for_json = false;
            match serde_json::from_str::<Value>(&json) {
                Ok(value) => {
                    let Some(mut candidate) = extract_candidate(&value, marker_timestamp) else {
                        json.clear();
                        return;
                    };
                    let (marker_profile, marker_mode) =
                        attribution_at(markers, candidate.observed_at);
                    if candidate.profile_id.is_none() {
                        candidate.profile_id = marker_profile;
                    }
                    let Some(profile_id) = candidate.profile_id else {
                        scan.unattributed_records += 1;
                        return;
                    };
                    let Some(game_mode) = marker_mode else {
                        scan.unattributed_records += 1;
                        return;
                    };
                    let event_material = format!(
                        "{}|{}|{}|{}|{}|{}",
                        candidate.event_id.as_deref().unwrap_or(""),
                        candidate.message_id.as_deref().unwrap_or(""),
                        candidate.task_id,
                        candidate.status,
                        candidate.occurred_at,
                        session_key
                    );
                    scan.events.push(QuestLogEvent {
                        event_key: hash_text(&event_material),
                        profile_key: hash_text(&profile_id),
                        game_mode,
                        task_id: candidate.task_id,
                        status: candidate.status,
                        occurred_at: candidate.occurred_at,
                        session_key: session_key.to_owned(),
                        quarantined: false,
                    });
                }
                Err(_) => scan.malformed_records += 1,
            }
            json.clear();
        },
    );
    if waiting_for_json && !json.is_empty() {
        scan.malformed_records += 1;
    }
}

fn for_each_bounded_line(mut reader: impl BufRead, mut visit: impl FnMut(&str, bool)) {
    let mut line = Vec::new();
    let mut truncated = false;
    loop {
        let Ok(buffer) = reader.fill_buf() else {
            break;
        };
        if buffer.is_empty() {
            if !line.is_empty() || truncated {
                let text = String::from_utf8_lossy(&line);
                visit(&text, truncated);
            }
            break;
        }
        let newline = buffer.iter().position(|byte| *byte == b'\n');
        let consumed = newline.map_or(buffer.len(), |index| index + 1);
        let content_end = newline.unwrap_or(buffer.len());
        if !truncated {
            let remaining = MAX_LINE_BYTES.saturating_sub(line.len());
            let append = content_end.min(remaining);
            line.extend_from_slice(&buffer[..append]);
            if append < content_end {
                truncated = true;
            }
        }
        reader.consume(consumed);
        if newline.is_some() {
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            let text = String::from_utf8_lossy(&line);
            visit(&text, truncated);
            line.clear();
            truncated = false;
        }
    }
}

fn update_json_depth(line: &str, depth: &mut i32, in_string: &mut bool, escaped: &mut bool) {
    for character in line.chars() {
        if *escaped {
            *escaped = false;
            continue;
        }
        if *in_string && character == '\\' {
            *escaped = true;
            continue;
        }
        if character == '"' {
            *in_string = !*in_string;
            continue;
        }
        if !*in_string {
            match character {
                '{' => *depth += 1,
                '}' => *depth -= 1,
                _ => {}
            }
        }
    }
}

fn extract_candidate(value: &Value, observed_at: i64) -> Option<CandidateEvent> {
    let message = find_quest_message(value)?;
    let message_type = message.get("type")?.as_i64()?;
    let status = match message_type {
        10 => "active",
        11 => "failed",
        12 => "completed",
        _ => return None,
    };
    let task_id = [
        "text",
        "successMessageText",
        "failMessageText",
        "description",
    ]
    .into_iter()
    .filter_map(|key| message.get(key).and_then(Value::as_str))
    .find_map(|text| {
        TASK_ID
            .captures(text)
            .and_then(|captures| captures.get(1))
            .map(|capture| capture.as_str().to_ascii_lowercase())
    })?;
    let occurred_at = message
        .get("dt")
        .and_then(Value::as_i64)
        .filter(|timestamp| *timestamp > 1_000_000_000)
        .map(|timestamp| timestamp.saturating_mul(1_000))
        .unwrap_or(observed_at);
    Some(CandidateEvent {
        event_id: find_string(value, "eventId"),
        message_id: message
            .get("_id")
            .and_then(Value::as_str)
            .map(str::to_owned),
        profile_id: find_string(value, "profileId")
            .filter(|profile| PROFILE_ID_ONLY.is_match(profile)),
        observed_at,
        occurred_at,
        task_id,
        status: status.into(),
    })
}

static PROFILE_ID_ONLY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^[a-f0-9]{24}$").expect("valid profile id regex"));

fn find_quest_message(value: &Value) -> Option<&serde_json::Map<String, Value>> {
    match value {
        Value::Object(object) => {
            let is_candidate = object
                .get("type")
                .and_then(Value::as_i64)
                .is_some_and(|kind| matches!(kind, 10..=12))
                && [
                    "text",
                    "successMessageText",
                    "failMessageText",
                    "description",
                ]
                .into_iter()
                .filter_map(|key| object.get(key).and_then(Value::as_str))
                .any(|text| TASK_ID.is_match(text));
            if is_candidate {
                return Some(object);
            }
            object.values().find_map(find_quest_message)
        }
        Value::Array(items) => items.iter().find_map(find_quest_message),
        _ => None,
    }
}

fn find_string(value: &Value, key: &str) -> Option<String> {
    match value {
        Value::Object(object) => object
            .iter()
            .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
            .and_then(|(_, value)| value.as_str())
            .map(str::to_owned)
            .or_else(|| object.values().find_map(|item| find_string(item, key))),
        Value::Array(items) => items.iter().find_map(|item| find_string(item, key)),
        _ => None,
    }
}

fn attribution_at(markers: &[Marker], observed_at: i64) -> (Option<String>, Option<String>) {
    let mut profile = None;
    let mut mode = None;
    for marker in markers
        .iter()
        .filter(|marker| marker.observed_at <= observed_at)
    {
        if marker.profile_id.is_some() {
            profile.clone_from(&marker.profile_id);
        }
        if marker.game_mode.is_some() {
            mode.clone_from(&marker.game_mode);
        }
    }
    (profile, mode)
}

fn parse_log_timestamp(line: &str) -> Option<i64> {
    let captures = TIMESTAMP.captures(line)?;
    let milliseconds = captures.get(3).map(|value| value.as_str()).unwrap_or("000");
    let text = format!(
        "{} {}.{}",
        captures.get(1)?.as_str(),
        captures.get(2)?.as_str(),
        milliseconds
    );
    NaiveDateTime::parse_from_str(&text, "%Y-%m-%d %H:%M:%S%.3f")
        .ok()
        .map(|timestamp| timestamp.and_utc().timestamp_millis())
}

fn normalize_mode(mode: &str) -> Option<&'static str> {
    match mode.to_ascii_lowercase().as_str() {
        "regular" => Some("regular"),
        "pve" => Some("pve"),
        "pvpseason" => Some("pvp-season"),
        _ => None,
    }
}

fn finalize_scan(scan: &mut QuestLogScan) {
    let mut deduplicated = HashMap::<String, QuestLogEvent>::new();
    for event in scan.events.drain(..) {
        deduplicated.entry(event.event_key.clone()).or_insert(event);
    }
    scan.events = deduplicated.into_values().collect();
    scan.events.sort_by(|left, right| {
        left.occurred_at
            .cmp(&right.occurred_at)
            .then_with(|| left.event_key.cmp(&right.event_key))
    });

    let mut summaries = HashMap::<(String, String), QuestLogProfile>::new();
    for event in &scan.events {
        let profile = summaries
            .entry((event.profile_key.clone(), event.game_mode.clone()))
            .or_insert_with(|| QuestLogProfile {
                profile_key: event.profile_key.clone(),
                game_mode: event.game_mode.clone(),
                last_seen: 0,
                event_count: 0,
                started_count: 0,
                failed_count: 0,
                completed_count: 0,
                is_current: false,
            });
        profile.last_seen = profile.last_seen.max(event.occurred_at);
        profile.event_count += 1;
        match event.status.as_str() {
            "active" => profile.started_count += 1,
            "failed" => profile.failed_count += 1,
            "completed" => profile.completed_count += 1,
            _ => {}
        }
    }
    let mut newest = HashMap::<String, (String, i64)>::new();
    for profile in summaries.values() {
        let candidate = newest
            .entry(profile.game_mode.clone())
            .or_insert_with(|| (profile.profile_key.clone(), profile.last_seen));
        if profile.last_seen > candidate.1 {
            *candidate = (profile.profile_key.clone(), profile.last_seen);
        }
    }
    scan.profiles = summaries.into_values().collect();
    for profile in &mut scan.profiles {
        profile.is_current = newest
            .get(&profile.game_mode)
            .is_some_and(|candidate| candidate.0 == profile.profile_key);
    }
    scan.profiles.sort_by(|left, right| {
        left.game_mode
            .cmp(&right.game_mode)
            .then_with(|| right.last_seen.cmp(&left.last_seen))
    });
    let fingerprint_material = scan
        .events
        .iter()
        .map(|event| event.event_key.as_str())
        .collect::<Vec<_>>()
        .join("|");
    scan.fingerprint = hash_text(&fingerprint_material);
}

fn hash_text(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn imports_multiline_notification_with_profile_and_mode() {
        assert_eq!(
            parse_log_timestamp("2026-08-21 10:00:00.000 Session mode: Pve"),
            Some(1_787_306_400_000)
        );
        let root = tempdir().unwrap();
        let session = root.path().join("log_2026.08.21_10-00-00_1.0.0.0");
        std::fs::create_dir(&session).unwrap();
        std::fs::write(
            session.join("application_000.log"),
            "2026-08-21 10:00:00.000 Session mode: Pve\n2026-08-21 10:00:01.000 SelectProfile ProfileId:0123456789abcdef01234567\n",
        )
        .unwrap();
        let mut notifications = File::create(session.join("push-notifications_000.log")).unwrap();
        writeln!(notifications, "2026-08-21 10:00:02.000 ChatMessageReceived").unwrap();
        writeln!(notifications, "{{\n  \"eventId\": \"event-1\",\n  \"message\": {{\n    \"_id\": \"message-1\",\n    \"type\": 12,\n    \"dt\": 1787306402,\n    \"successMessageText\": \"abcdefabcdefabcdefabcdef complete\"\n  }}\n}}").unwrap();

        let scan = scan_logs(root.path(), false).unwrap();
        assert_eq!(scan.events.len(), 1);
        assert_eq!(scan.events[0].game_mode, "pve");
        assert_eq!(scan.events[0].task_id, "abcdefabcdefabcdefabcdef");
        assert_eq!(scan.events[0].status, "completed");
        assert_eq!(scan.profiles.len(), 1);
        assert!(scan.profiles[0].is_current);
        assert!(!scan.events[0].profile_key.contains("012345"));
    }

    #[test]
    fn quarantines_patch_reissue_bursts() {
        let root = tempdir().unwrap();
        let session = root.path().join("log_2026.08.21_10-00-00_1.0.0.0");
        std::fs::create_dir(&session).unwrap();
        std::fs::write(
            session.join("application_000.log"),
            "2026-08-21 10:00:00.000 Session mode: Regular\n2026-08-21 10:00:01.000 ProfileId:0123456789abcdef01234567\n",
        )
        .unwrap();
        let mut notifications = File::create(session.join("notifications.log")).unwrap();
        for index in 0..21 {
            writeln!(
                notifications,
                "2026-08-21 10:00:{:02}.000 ChatMessageReceived",
                index + 2
            )
            .unwrap();
            writeln!(notifications, "{{\"eventId\":\"{index}\",\"message\":{{\"type\":10,\"text\":\"{:024x} started\"}}}}", index + 1).unwrap();
        }
        let scan = scan_logs(root.path(), false).unwrap();
        assert_eq!(scan.suspicious_sessions, 1);
        assert!(scan.events.iter().all(|event| event.quarantined));
    }

    #[test]
    fn imports_output_events_even_when_notifications_exist() {
        let root = tempdir().unwrap();
        let session = root.path().join("log_2026.08.21_10-00-00_1.0.0.0");
        std::fs::create_dir(&session).unwrap();
        std::fs::write(
            session.join("application_000.log"),
            "2026-08-21 10:00:00.000 Session mode: PvpSeason\n2026-08-21 10:00:01.000 ProfileId:0123456789abcdef01234567\n",
        )
        .unwrap();
        std::fs::write(
            session.join("push-notifications_000.log"),
            "2026-08-21 10:00:01.500 {\"type\":\"userMatchCreated\",\"eventId\":\"abcdefabcdefabcdefabcdef\"}\n",
        )
        .unwrap();
        std::fs::write(
            session.join("output_000.log"),
            "2026-08-21 10:00:02.000 AcceptQuest without an attributable task id\n2026-08-21 10:00:03.000 ChatMessageReceived\n{\"eventId\":\"event-1\",\"message\":{\"_id\":\"message-1\",\"type\":10,\"text\":\"abcdefabcdefabcdefabcdef started\"}}\n",
        )
        .unwrap();

        let scan = scan_logs(root.path(), false).unwrap();
        assert_eq!(scan.events.len(), 1);
        assert_eq!(scan.events[0].game_mode, "pvp-season");
        assert_eq!(scan.sessions_scanned, 1);
        assert_eq!(scan.files_scanned, 2);
        assert_eq!(scan.notification_files_scanned, 1);
        assert_eq!(scan.output_files_scanned, 1);
        assert_eq!(scan.chat_message_markers, 1);
        assert_eq!(scan.lifecycle_hints, 1);
        assert_eq!(scan.malformed_records, 0);
    }

    #[test]
    fn deduplicates_the_same_event_across_notification_and_output_logs() {
        let root = tempdir().unwrap();
        let session = root.path().join("log_2026.08.21_10-00-00_1.0.0.0");
        std::fs::create_dir(&session).unwrap();
        std::fs::write(
            session.join("application_000.log"),
            "2026-08-21 10:00:00.000 Session mode: Regular\n2026-08-21 10:00:01.000 ProfileId:0123456789abcdef01234567\n",
        )
        .unwrap();
        let event = "2026-08-21 10:00:02.000 ChatMessageReceived\n{\"eventId\":\"event-1\",\"message\":{\"_id\":\"message-1\",\"type\":12,\"dt\":1787306402,\"successMessageText\":\"abcdefabcdefabcdefabcdef complete\"}}\n";
        std::fs::write(session.join("push-notifications_000.log"), event).unwrap();
        std::fs::write(session.join("output_000.log"), event).unwrap();

        let scan = scan_logs(root.path(), false).unwrap();
        assert_eq!(scan.events.len(), 1);
        assert_eq!(scan.files_scanned, 2);
        assert_eq!(scan.chat_message_markers, 2);
    }

    #[test]
    fn reports_partial_json_without_importing_it() {
        let root = tempdir().unwrap();
        let session = root.path().join("log_2026.08.21_10-00-00_1.0.0.0");
        std::fs::create_dir(&session).unwrap();
        std::fs::write(
            session.join("application_000.log"),
            "2026-08-21 10:00:00.000 Session mode: Regular\n2026-08-21 10:00:01.000 ProfileId:0123456789abcdef01234567\n",
        )
        .unwrap();
        std::fs::write(
            session.join("notifications.log"),
            "2026-08-21 10:00:02.000 ChatMessageReceived\n{\"message\":{\"type\":12,\n",
        )
        .unwrap();

        let scan = scan_logs(root.path(), false).unwrap();
        assert!(scan.events.is_empty());
        assert_eq!(scan.malformed_records, 1);
    }
}

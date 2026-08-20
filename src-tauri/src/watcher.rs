use crate::log_parser::{parse_log_chunk, LogEvent};
use crate::model::{
    LocatorSnapshotPayload, LocatorStatusPayload, MapContextPayload, OcrTextPayload, Settings,
};
use crate::ocr::read_exfil_text;
use crate::parser::parse_screenshot_filename;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::{HashSet, VecDeque};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Arc, RwLock};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter};

#[derive(Debug)]
pub enum ControlMessage {
    Rescan,
    ReadLatest,
    Stop,
}

#[derive(Default)]
struct Tail {
    path: Option<PathBuf>,
    offset: u64,
    pending: String,
}

#[derive(Default)]
struct RuntimeStatus {
    screenshots_dir: Option<PathBuf>,
    logs_dir: Option<PathBuf>,
    screenshot_ready: bool,
    log_ready: bool,
    last_filename: Option<String>,
    last_error: Option<String>,
}

impl RuntimeStatus {
    fn payload(&self, level: &str, message: impl Into<String>) -> LocatorStatusPayload {
        LocatorStatusPayload {
            level: level.into(),
            message: message.into(),
            screenshots_dir: self
                .screenshots_dir
                .as_ref()
                .map(|p| p.to_string_lossy().into_owned()),
            logs_dir: self
                .logs_dir
                .as_ref()
                .map(|p| p.to_string_lossy().into_owned()),
            screenshot_watcher_ready: self.screenshot_ready,
            log_watcher_ready: self.log_ready,
            last_filename: self.last_filename.clone(),
            last_error: self.last_error.clone(),
        }
    }
}

pub fn spawn_locator(
    app: AppHandle,
    settings: Arc<RwLock<Settings>>,
    snapshot: Arc<RwLock<LocatorSnapshotPayload>>,
) -> mpsc::Sender<ControlMessage> {
    let (control_tx, control_rx) = mpsc::channel();
    std::thread::Builder::new()
        .name("tarkov-locator".into())
        .spawn(move || run_locator(app, settings, snapshot, control_rx))
        .expect("failed to start locator thread");
    control_tx
}

fn run_locator(
    app: AppHandle,
    settings: Arc<RwLock<Settings>>,
    snapshot: Arc<RwLock<LocatorSnapshotPayload>>,
    control_rx: mpsc::Receiver<ControlMessage>,
) {
    let started_at = SystemTime::now();
    let (file_tx, file_rx) = mpsc::channel::<PathBuf>();
    let mut watcher: Option<RecommendedWatcher> = None;
    let mut watched_dir: Option<PathBuf> = None;
    let mut seen = HashSet::new();
    let mut seen_order = VecDeque::new();
    let mut tail = Tail::default();
    let mut current_map: Option<String> = None;
    let mut in_raid = false;
    let mut status = RuntimeStatus::default();
    let mut tick = 0_u64;
    let mut force_rescan = true;
    let mut read_latest = false;

    loop {
        match control_rx.try_recv() {
            Ok(ControlMessage::Stop) => break,
            Ok(ControlMessage::Rescan) => force_rescan = true,
            Ok(ControlMessage::ReadLatest) => read_latest = true,
            Err(mpsc::TryRecvError::Disconnected) => break,
            Err(mpsc::TryRecvError::Empty) => {}
        }

        let settings_snapshot = settings
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone();
        if force_rescan || tick.is_multiple_of(20) {
            let resolved_shots = resolve_screenshots_dir(&settings_snapshot);
            if force_rescan || resolved_shots != watched_dir {
                watcher = None;
                watched_dir = resolved_shots.clone();
                if let Some(dir) = &resolved_shots {
                    let sender = file_tx.clone();
                    match notify::recommended_watcher(
                        move |result: Result<Event, notify::Error>| {
                            if let Ok(event) = result {
                                for path in event.paths {
                                    let _ = sender.send(path);
                                }
                            }
                        },
                    ) {
                        Ok(mut created) => match created.watch(dir, RecursiveMode::NonRecursive) {
                            Ok(()) => {
                                watcher = Some(created);
                                status.screenshot_ready = true;
                                status.last_error = None;
                            }
                            Err(error) => {
                                status.screenshot_ready = false;
                                status.last_error =
                                    Some(format!("Could not watch screenshots: {error}"));
                            }
                        },
                        Err(error) => {
                            status.screenshot_ready = false;
                            status.last_error =
                                Some(format!("Could not create screenshot watcher: {error}"));
                        }
                    }
                } else {
                    status.screenshot_ready = false;
                }
                status.screenshots_dir = resolved_shots;
                emit_status(
                    &app,
                    &snapshot,
                    status.payload("info", "Locator paths refreshed"),
                );
            }

            let log_folder = resolve_latest_log_folder(&settings_snapshot);
            if log_folder != status.logs_dir {
                status.logs_dir = log_folder;
                status.log_ready = status.logs_dir.is_some();
                tail = Tail::default();
                let message = if status.log_ready {
                    "Raid detection connected"
                } else {
                    "Map auto-detection is waiting for Tarkov logs"
                };
                emit_status(&app, &snapshot, status.payload("info", message));
            }
            force_rescan = false;
        }

        if let Some(log_folder) = &status.logs_dir {
            retarget_application_log(&mut tail, log_folder);
            if let Some(chunk) = read_new(&mut tail) {
                for event in parse_log_chunk(&mut tail.pending, &chunk) {
                    match event {
                        LogEvent::MapDetected(map_id) => {
                            current_map = Some(map_id);
                            emit_map_context(&app, &snapshot, &current_map, in_raid, "logs");
                        }
                        LogEvent::RaidStarted => {
                            in_raid = true;
                            emit_map_context(&app, &snapshot, &current_map, in_raid, "logs");
                        }
                        LogEvent::RaidEnded => {
                            if in_raid {
                                in_raid = false;
                                current_map = None;
                                emit_map_context(&app, &snapshot, &current_map, in_raid, "logs");
                                snapshot
                                    .write()
                                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                                    .fix = None;
                                let _ = app.emit("locator://clear-position", ());
                            }
                        }
                    }
                }
            }
        }

        let mut candidates: Vec<PathBuf> = file_rx.try_iter().collect();
        if tick.is_multiple_of(2) {
            if let Some(dir) = &watched_dir {
                candidates.extend(scan_new_pngs(dir, started_at));
            }
        }
        let forced_latest = if read_latest {
            read_latest = false;
            watched_dir.as_deref().and_then(latest_png)
        } else {
            None
        };
        if let Some(path) = &forced_latest {
            candidates.push(path.clone());
        }
        candidates.sort_by_key(|path| path.metadata().and_then(|m| m.modified()).ok());
        candidates.dedup();
        for path in candidates {
            let forced = forced_latest.as_ref() == Some(&path);
            if !is_png(&path) || (!forced && seen.contains(&path)) {
                continue;
            }
            let is_new = path
                .metadata()
                .and_then(|metadata| metadata.modified())
                .map(|modified| modified >= started_at)
                .unwrap_or(false);
            if !is_new && !forced {
                continue;
            }
            remember_seen(&mut seen, &mut seen_order, path.clone());
            let Some(filename) = path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
            else {
                continue;
            };
            match parse_screenshot_filename(&filename, current_map.clone()) {
                Ok(fix) => {
                    status.last_filename = Some(filename.clone());
                    status.last_error = None;
                    snapshot
                        .write()
                        .unwrap_or_else(|poisoned| poisoned.into_inner())
                        .fix = Some(fix.clone());
                    let _ = app.emit("locator://player-fix", &fix);
                    emit_status(
                        &app,
                        &snapshot,
                        status.payload("success", "Position updated"),
                    );
                    match read_exfil_text_with_retry(&path) {
                        Ok(raw_text) if !raw_text.trim().is_empty() => {
                            emit_ocr_text(
                                &app,
                                &snapshot,
                                OcrTextPayload {
                                    observed_at: now_millis(),
                                    map_id: current_map.clone(),
                                    raw_text,
                                    message: "Screenshot text analyzed locally".into(),
                                },
                            );
                        }
                        Ok(_) => {}
                        Err(error) => {
                            emit_ocr_text(
                                &app,
                                &snapshot,
                                OcrTextPayload {
                                    observed_at: now_millis(),
                                    map_id: current_map.clone(),
                                    raw_text: String::new(),
                                    message: error,
                                },
                            );
                        }
                    }
                    if settings_snapshot.delete_parsed_screenshots {
                        if let Err(error) = delete_with_retry(&path) {
                            status.last_error = Some(error);
                            emit_status(
                                &app,
                                &snapshot,
                                status.payload("warning", "Position updated, but cleanup failed"),
                            );
                        }
                    }
                }
                Err(error) => {
                    status.last_error = Some(format!("{filename}: {error}"));
                    emit_status(
                        &app,
                        &snapshot,
                        status.payload("warning", "A new PNG did not contain Tarkov coordinates"),
                    );
                }
            }
        }

        tick = tick.wrapping_add(1);
        std::thread::sleep(Duration::from_millis(500));
        let _keep_watcher_alive = &watcher;
    }
}

fn latest_png(dir: &Path) -> Option<PathBuf> {
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| is_png(path))
        .max_by_key(|path| {
            path.metadata()
                .and_then(|metadata| metadata.modified())
                .ok()
        })
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn read_exfil_text_with_retry(path: &Path) -> Result<String, String> {
    let mut latest = Err("Screenshot could not be analyzed".to_string());
    for delay in [0, 80, 160, 320] {
        if delay > 0 {
            std::thread::sleep(Duration::from_millis(delay));
        }
        latest = read_exfil_text(path);
        if latest.is_ok() {
            break;
        }
    }
    latest
}

fn emit_map_context(
    app: &AppHandle,
    snapshot: &Arc<RwLock<LocatorSnapshotPayload>>,
    map_id: &Option<String>,
    in_raid: bool,
    source: &str,
) {
    let payload = MapContextPayload {
        map_id: map_id.clone(),
        in_raid,
        source: source.into(),
    };
    snapshot
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .map_context = payload.clone();
    let _ = app.emit("locator://map-context", payload);
}

fn emit_status(
    app: &AppHandle,
    snapshot: &Arc<RwLock<LocatorSnapshotPayload>>,
    payload: LocatorStatusPayload,
) {
    snapshot
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .status = Some(payload.clone());
    let _ = app.emit("locator://status", payload);
}

fn emit_ocr_text(
    app: &AppHandle,
    snapshot: &Arc<RwLock<LocatorSnapshotPayload>>,
    payload: OcrTextPayload,
) {
    snapshot
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .ocr_text = Some(payload.clone());
    let _ = app.emit("locator://ocr-text", payload);
}

fn is_png(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.to_string_lossy().eq_ignore_ascii_case("png"))
}

fn scan_new_pngs(dir: &Path, started_at: SystemTime) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| is_png(path))
        .filter(|path| {
            path.metadata()
                .and_then(|metadata| metadata.modified())
                .map(|modified| modified >= started_at)
                .unwrap_or(false)
        })
        .collect()
}

fn remember_seen(seen: &mut HashSet<PathBuf>, order: &mut VecDeque<PathBuf>, path: PathBuf) {
    seen.insert(path.clone());
    order.push_back(path);
    while order.len() > 512 {
        if let Some(expired) = order.pop_front() {
            seen.remove(&expired);
        }
    }
}

fn delete_with_retry(path: &Path) -> Result<(), String> {
    let mut last_error = None;
    for _ in 0..8 {
        match std::fs::remove_file(path) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = Some(error);
                std::thread::sleep(Duration::from_millis(150));
            }
        }
    }
    Err(format!(
        "Could not delete parsed screenshot: {}",
        last_error
            .map(|e| e.to_string())
            .unwrap_or_else(|| "unknown error".into())
    ))
}

fn resolve_screenshots_dir(settings: &Settings) -> Option<PathBuf> {
    if let Some(configured) = &settings.screenshots_dir {
        return configured.is_dir().then(|| configured.clone());
    }
    let documents = dirs::document_dir()?;
    ["Escape from Tarkov", "Escape From Tarkov"]
        .into_iter()
        .map(|name| documents.join(name).join("Screenshots"))
        .find(|path| path.is_dir())
}

fn resolve_latest_log_folder(settings: &Settings) -> Option<PathBuf> {
    if let Some(configured) = &settings.logs_dir {
        return latest_under_logs_root(configured);
    }
    automatic_logs_roots()
        .into_iter()
        .filter_map(|root| latest_under_logs_root(&root))
        .max_by_key(|folder| {
            folder
                .metadata()
                .and_then(|metadata| metadata.modified())
                .ok()
        })
}

fn latest_under_logs_root(root: &Path) -> Option<PathBuf> {
    if root
        .file_name()
        .is_some_and(|name| name.to_string_lossy().starts_with("log_"))
        && root.is_dir()
    {
        return Some(root.to_path_buf());
    }
    std::fs::read_dir(root)
        .ok()?
        .flatten()
        .filter(|entry| {
            entry.file_name().to_string_lossy().starts_with("log_")
                && entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false)
        })
        .max_by_key(|entry| {
            entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .ok()
        })
        .map(|entry| entry.path())
}

fn automatic_logs_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(program_files) = std::env::var("ProgramFiles(x86)") {
        roots.push(
            Path::new(&program_files)
                .join("Steam")
                .join("steamapps")
                .join("common")
                .join("Escape From Tarkov")
                .join("build")
                .join("Logs"),
        );
    }
    for install in registry_install_locations() {
        add_install_log_roots(&mut roots, &install);
    }
    for install in steam_install_locations() {
        add_install_log_roots(&mut roots, &install);
    }
    for install in launcher_install_locations() {
        add_install_log_roots(&mut roots, &install);
    }
    for install in running_tarkov_install_locations() {
        add_install_log_roots(&mut roots, &install);
    }
    roots.sort();
    roots.dedup();
    roots
}

fn add_install_log_roots(roots: &mut Vec<PathBuf>, install: &Path) {
    roots.push(install.join("Logs"));
    roots.push(install.join("build").join("Logs"));
    if let Some(parent) = install.parent() {
        roots.push(parent.join("Logs"));
    }
}

fn launcher_install_locations() -> Vec<PathBuf> {
    let mut settings_files = Vec::new();
    if let Some(config) = dirs::config_dir() {
        settings_files.push(
            config
                .join("Battlestate Games")
                .join("BsgLauncher")
                .join("settings"),
        );
    }
    if let Some(local) = dirs::data_local_dir() {
        settings_files.push(
            local
                .join("Battlestate Games")
                .join("BsgLauncher")
                .join("settings"),
        );
    }
    let mut locations = Vec::new();
    for file in settings_files {
        let Ok(contents) = std::fs::read_to_string(file) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&contents) else {
            continue;
        };
        let Some(root) = value.get("gamesRootDir").and_then(|entry| entry.as_str()) else {
            continue;
        };
        let root = PathBuf::from(root);
        locations.extend([
            root.clone(),
            root.join("Escape From Tarkov"),
            root.join("Escape from Tarkov"),
            root.join("EFT"),
        ]);
    }
    locations.sort();
    locations.dedup();
    locations
}

#[cfg(windows)]
fn running_tarkov_install_locations() -> Vec<PathBuf> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    let Ok(process_snapshot) = (unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }) else {
        return Vec::new();
    };
    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };
    let mut locations = Vec::new();
    let mut has_entry = unsafe { Process32FirstW(process_snapshot, &mut entry) }.is_ok();
    while has_entry {
        let length = entry
            .szExeFile
            .iter()
            .position(|character| *character == 0)
            .unwrap_or(entry.szExeFile.len());
        let executable = String::from_utf16_lossy(&entry.szExeFile[..length]).to_ascii_lowercase();
        if matches!(
            executable.as_str(),
            "escapefromtarkov.exe" | "escapefromtarkov_be.exe"
        ) {
            if let Ok(process) = unsafe {
                OpenProcess(
                    PROCESS_QUERY_LIMITED_INFORMATION,
                    false,
                    entry.th32ProcessID,
                )
            } {
                let mut path = vec![0_u16; 32_768];
                let mut size = path.len() as u32;
                if unsafe {
                    QueryFullProcessImageNameW(
                        process,
                        PROCESS_NAME_WIN32,
                        PWSTR(path.as_mut_ptr()),
                        &mut size,
                    )
                }
                .is_ok()
                {
                    path.truncate(size as usize);
                    if let Some(parent) = PathBuf::from(String::from_utf16_lossy(&path)).parent() {
                        locations.push(parent.to_path_buf());
                    }
                }
                let _ = unsafe { CloseHandle(process) };
            }
        }
        has_entry = unsafe { Process32NextW(process_snapshot, &mut entry) }.is_ok();
    }
    let _ = unsafe { CloseHandle(process_snapshot) };
    locations.sort();
    locations.dedup();
    locations
}

#[cfg(not(windows))]
fn running_tarkov_install_locations() -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(windows)]
fn registry_install_locations() -> Vec<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    let mut locations = Vec::new();
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let root = RegKey::predef(hive);
        for key_path in [
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ] {
            let Ok(uninstall) = root.open_subkey_with_flags(key_path, KEY_READ) else {
                continue;
            };
            for subkey_name in uninstall.enum_keys().flatten() {
                let Ok(subkey) = uninstall.open_subkey_with_flags(subkey_name, KEY_READ) else {
                    continue;
                };
                let display_name: String = subkey.get_value("DisplayName").unwrap_or_default();
                if !display_name
                    .to_ascii_lowercase()
                    .contains("escape from tarkov")
                {
                    continue;
                }
                let install_location: String =
                    subkey.get_value("InstallLocation").unwrap_or_default();
                if !install_location.trim().is_empty() {
                    locations.push(PathBuf::from(install_location));
                }
            }
        }
    }
    locations
}

#[cfg(windows)]
fn steam_install_locations() -> Vec<PathBuf> {
    use regex::Regex;
    use std::sync::LazyLock;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    static LIBRARY_PATH: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r#"(?i)"path"\s+"(?P<path>[^"]+)""#).expect("valid Steam library regex")
    });
    static INSTALL_DIR: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r#"(?i)"installdir"\s+"(?P<name>[^"]+)""#).expect("valid Steam manifest regex")
    });

    let mut steam_roots = Vec::new();
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let root = RegKey::predef(hive);
        let Ok(key) = root.open_subkey_with_flags(r"SOFTWARE\Valve\Steam", KEY_READ) else {
            continue;
        };
        for value_name in ["SteamPath", "InstallPath"] {
            let value: String = key.get_value(value_name).unwrap_or_default();
            if !value.trim().is_empty() {
                steam_roots.push(PathBuf::from(value));
            }
        }
    }

    let mut libraries = steam_roots.clone();
    for root in steam_roots {
        let file = root.join("steamapps").join("libraryfolders.vdf");
        let Ok(contents) = std::fs::read_to_string(file) else {
            continue;
        };
        for capture in LIBRARY_PATH.captures_iter(&contents) {
            libraries.push(PathBuf::from(capture["path"].replace(r"\\", r"\")));
        }
    }
    libraries.sort();
    libraries.dedup();

    let mut installs = Vec::new();
    for library in libraries {
        let steamapps = library.join("steamapps");
        let manifest = steamapps.join("appmanifest_3932890.acf");
        if let Ok(contents) = std::fs::read_to_string(manifest) {
            if let Some(capture) = INSTALL_DIR.captures(&contents) {
                let candidate = steamapps.join("common").join(&capture["name"]);
                if candidate.is_dir() {
                    installs.push(candidate);
                    continue;
                }
            }
        }
        let candidate = steamapps.join("common").join("Escape from Tarkov");
        if candidate.is_dir() {
            installs.push(candidate);
        }
    }
    installs.sort();
    installs.dedup();
    installs
}

#[cfg(not(windows))]
fn registry_install_locations() -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(not(windows))]
fn steam_install_locations() -> Vec<PathBuf> {
    Vec::new()
}

fn retarget_application_log(tail: &mut Tail, folder: &Path) {
    let newest = std::fs::read_dir(folder)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| {
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            name.contains("application") && name.ends_with(".log")
        })
        .max_by_key(|entry| {
            entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .ok()
        })
        .map(|entry| entry.path());
    let Some(newest) = newest else { return };
    if tail.path.as_deref() != Some(newest.as_path()) {
        tail.path = Some(newest);
        tail.offset = 0;
        tail.pending.clear();
    }
}

fn read_new(tail: &mut Tail) -> Option<String> {
    let path = tail.path.as_ref()?;
    let mut file = File::open(path).ok()?;
    let length = file.metadata().ok()?.len();
    if length < tail.offset {
        tail.offset = 0;
    }
    if length == tail.offset {
        return None;
    }
    file.seek(SeekFrom::Start(tail.offset)).ok()?;
    let mut bytes = Vec::with_capacity((length - tail.offset) as usize);
    file.read_to_end(&mut bytes).ok()?;
    tail.offset = length;
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn latest_log_folder_and_tail_handle_rotation() {
        let temp = tempfile::tempdir().unwrap();
        let session = temp.path().join("log_test");
        std::fs::create_dir(&session).unwrap();
        let path = session.join("2026 application_000.log");
        let mut file = File::create(&path).unwrap();
        writeln!(file, "one").unwrap();
        assert_eq!(latest_under_logs_root(temp.path()), Some(session.clone()));
        let mut tail = Tail::default();
        retarget_application_log(&mut tail, &session);
        assert!(read_new(&mut tail).unwrap().contains("one"));
        assert!(read_new(&mut tail).is_none());
    }

    #[test]
    fn derives_supported_log_roots_from_an_install() {
        let install = Path::new(r"D:\Tarkov");
        let mut roots = Vec::new();
        add_install_log_roots(&mut roots, install);
        assert!(roots.contains(&install.join("Logs")));
        assert!(roots.contains(&install.join("build").join("Logs")));
    }
}

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { LocatorSettings, LocatorStatus, MapContext, OcrTextCapture, PlayerFix, QuestProgress, QuestStatus } from "./types";

export const defaultSettings: LocatorSettings = {
  schemaVersion: 2,
  screenshotsDir: null,
  logsDir: null,
  alwaysOnTop: false,
  followPlayer: true,
  autoFloor: true,
  deleteParsedScreenshots: false,
  selectedMap: "customs",
  visibleMapLayers: ["extract-pmc", "extract-scav", "extract-shared", "transit", "switch", "btr"],
  legendOpen: false,
  highContrast: false,
  overlayOpacity: 0.92,
  overlayScale: 1,
};

let settingsQueue = Promise.resolve<LocatorSettings>(defaultSettings);

export function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export async function loadSettings(): Promise<LocatorSettings> {
  if (!isTauriRuntime()) return defaultSettings;
  return invoke<LocatorSettings>("get_settings");
}

export async function saveSettings(settings: LocatorSettings): Promise<LocatorSettings> {
  if (!isTauriRuntime()) return settings;
  settingsQueue = settingsQueue.catch(() => settings).then(() => invoke<LocatorSettings>("update_settings", { settings }));
  return settingsQueue;
}

export async function chooseDirectory(kind: "screenshots" | "logs"): Promise<LocatorSettings> {
  if (!isTauriRuntime()) return defaultSettings;
  return invoke<LocatorSettings>("choose_directory", { kind });
}

export async function rescanDirectories() {
  if (isTauriRuntime()) await invoke("rescan_directories");
}

export async function readLatestScreenshot() {
  if (isTauriRuntime()) await invoke("read_latest_screenshot");
}

export async function openDirectory(kind: "screenshots" | "logs") {
  if (isTauriRuntime()) await invoke("open_directory", { kind });
}

export async function clearPlayerPosition() {
  if (isTauriRuntime()) await invoke("clear_player_position");
}

export async function toggleOverlay() {
  if (isTauriRuntime()) await invoke("toggle_overlay");
}

export async function setOverlayClickThrough(enabled: boolean) {
  if (isTauriRuntime()) await invoke("set_overlay_click_through", { enabled });
}

let shortcutRegistration: Promise<void> | null = null;
export function registerGlobalShortcuts() {
  if (!isTauriRuntime()) return Promise.resolve();
  if (shortcutRegistration) return shortcutRegistration;
  shortcutRegistration = (async () => {
    const { isRegistered, register } = await import("@tauri-apps/plugin-global-shortcut");
    if (!await isRegistered("Ctrl+Shift+M")) {
      await register("Ctrl+Shift+M", (event) => {
        if (event.state === "Pressed") void toggleOverlay();
      });
    }
    if (!await isRegistered("Ctrl+Shift+X")) {
      await register("Ctrl+Shift+X", (event) => {
        if (event.state === "Pressed") void setOverlayClickThrough(false);
      });
    }
  })().catch((error) => {
    shortcutRegistration = null;
    throw error;
  });
  return shortcutRegistration;
}

export async function getQuestProgress(gameMode: "regular" | "pve"): Promise<QuestProgress[]> {
  if (isTauriRuntime()) return invoke<QuestProgress[]>("get_quest_progress", { gameMode });
  return JSON.parse(localStorage.getItem(`quest-progress:${gameMode}`) ?? "[]") as QuestProgress[];
}

export async function setQuestProgress(gameMode: "regular" | "pve", taskId: string, status: QuestStatus): Promise<QuestProgress> {
  if (isTauriRuntime()) return invoke<QuestProgress>("set_quest_progress", { gameMode, taskId, status });
  const progress = await getQuestProgress(gameMode);
  const next = { taskId, status, updatedAt: Date.now() };
  localStorage.setItem(`quest-progress:${gameMode}`, JSON.stringify([...progress.filter((entry) => entry.taskId !== taskId), next]));
  return next;
}

export async function subscribeLocator(handlers: {
  onFix: (fix: PlayerFix) => void;
  onStatus: (status: LocatorStatus) => void;
  onMapContext: (context: MapContext) => void;
  onClear: () => void;
  onOcrText?: (capture: OcrTextCapture) => void;
  onSettings?: (settings: LocatorSettings) => void;
}): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => undefined;
  const unlisteners = await Promise.all([
    listen<PlayerFix>("locator://player-fix", (event) => handlers.onFix(event.payload)),
    listen<LocatorStatus>("locator://status", (event) => handlers.onStatus(event.payload)),
    listen<MapContext>("locator://map-context", (event) => handlers.onMapContext(event.payload)),
    listen("locator://clear-position", handlers.onClear),
    listen<OcrTextCapture>("locator://ocr-text", (event) => handlers.onOcrText?.(event.payload)),
    listen<LocatorSettings>("locator://settings-changed", (event) => handlers.onSettings?.(event.payload)),
  ]);
  return () => unlisteners.forEach((unlisten) => unlisten());
}

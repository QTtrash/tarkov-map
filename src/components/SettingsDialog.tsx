import { isTauriRuntime, readLatestScreenshot, resetOverlayWindow, rescanDirectories } from "../locator";
import type { MapSessionState } from "../map-session";
import type { LocatorSettings, LocatorStatus, OverlayState, RaidExtractState } from "../types";
import { Dialog } from "./Dialog";
import { UiIcon } from "./Icons";

interface SettingsDialogProps {
  settings: LocatorSettings;
  status: LocatorStatus;
  mapSession: MapSessionState;
  overlayState: OverlayState;
  dataGeneratedAt: string | null;
  raidExtracts: RaidExtractState | null;
  onClose: () => void;
  onBrowse: (kind: "screenshots" | "logs") => Promise<void>;
  onOpenDirectory: (kind: "screenshots" | "logs") => Promise<void>;
  onUpdateSettings: (patch: Partial<LocatorSettings>) => void;
  onOverlayAction: (action: () => Promise<void>, failureMessage: string) => Promise<void>;
}

export function SettingsDialog({
  settings,
  status,
  mapSession,
  overlayState,
  dataGeneratedAt,
  raidExtracts,
  onClose,
  onBrowse,
  onOpenDirectory,
  onUpdateSettings,
  onOverlayAction,
}: SettingsDialogProps) {
  return (
    <Dialog className="settings-dialog" titleId="settings-title" onClose={onClose}>
      <header>
        <div>
          <span className="kicker">SYSTEM CONFIGURATION</span>
          <h2 id="settings-title">Raid Signal settings</h2>
        </div>
        <button className="bare-icon" onClick={onClose} aria-label="Close">
          <UiIcon name="close" />
        </button>
      </header>
      <div className="dialog-section">
        <h3>DATA SOURCES</h3>
        <p>The locator reads files created by Tarkov. No game memory or network connection is used.</p>
        <button className="folder-row" onClick={() => void onBrowse("screenshots")}>
          <UiIcon name="folder" />
          <span>
            <b>SCREENSHOTS</b>
            <small>{status.screenshotsDir ?? "Folder not detected"}</small>
          </span>
          <strong>BROWSE</strong>
        </button>
        {status.screenshotsDir && (
          <button className="inline-action" onClick={() => void onOpenDirectory("screenshots")}>
            OPEN SCREENSHOTS FOLDER
          </button>
        )}
        <button className="folder-row" onClick={() => void onBrowse("logs")}>
          <UiIcon name="folder" />
          <span>
            <b>APPLICATION LOGS</b>
            <small>{status.logsDir ?? "Folder not detected"}</small>
          </span>
          <strong>BROWSE</strong>
        </button>
        {status.logsDir && (
          <button className="inline-action" onClick={() => void onOpenDirectory("logs")}>
            OPEN LOGS FOLDER
          </button>
        )}
        <button className="dialog-button" onClick={() => void rescanDirectories()}>
          RESCAN FOLDERS
        </button>
        <button className="dialog-button secondary" onClick={() => void readLatestScreenshot()}>
          READ LATEST SCREENSHOT
        </button>
      </div>
      <div className="dialog-section">
        <h3>FILE HANDLING & DISPLAY</h3>
        <label className="switch-row">
          <span>
            <b>Delete parsed screenshots</b>
            <small>Disabled by default. Invalid and older files are never removed.</small>
          </span>
          <input
            type="checkbox"
            checked={settings.deleteParsedScreenshots}
            onChange={(event) => onUpdateSettings({ deleteParsedScreenshots: event.target.checked })}
          />
        </label>
        <label className="switch-row">
          <span>
            <b>High contrast</b>
            <small>Improves text and control contrast without changing map data.</small>
          </span>
          <input
            type="checkbox"
            checked={settings.highContrast}
            onChange={(event) => onUpdateSettings({ highContrast: event.target.checked })}
          />
        </label>
        <label className="range-row">
          <span>
            <b>Overlay opacity</b>
            <small>Ctrl+Shift+M toggles the overlay; Ctrl+Shift+X restores clicks.</small>
          </span>
          <input
            type="range"
            min="0.35"
            max="1"
            step="0.05"
            value={settings.overlayOpacity}
            onChange={(event) => onUpdateSettings({ overlayOpacity: Number(event.target.value) })}
          />
          <output>{Math.round(settings.overlayOpacity * 100)}%</output>
        </label>
        <button
          className="dialog-button secondary"
          onClick={() => void onOverlayAction(resetOverlayWindow, "Overlay could not be reset")}
        >
          RESET & SHOW OVERLAY
        </button>
      </div>
      <div className="dialog-section diagnostics">
        <h3>DIAGNOSTICS</h3>
        <dl className="telemetry-list">
          <div>
            <dt>RUNTIME</dt>
            <dd>{isTauriRuntime() ? "TAURI DESKTOP" : "BROWSER PREVIEW"}</dd>
          </div>
          <div>
            <dt>RAID STATE</dt>
            <dd>{mapSession.inRaid ? "IN RAID" : "NOT DETECTED"}</dd>
          </div>
          <div>
            <dt>MAP SOURCE</dt>
            <dd>{mapSession.source.toUpperCase()}</dd>
          </div>
          <div>
            <dt>VIEW MODE</dt>
            <dd>{mapSession.browsingAway ? "BROWSING AWAY" : "FOLLOWING RAID"}</dd>
          </div>
          <div>
            <dt>OVERLAY</dt>
            <dd>{overlayState.visible ? (overlayState.clickThrough ? "CLICK-THROUGH" : "INTERACTIVE") : "HIDDEN"}</dd>
          </div>
          <div>
            <dt>SHORTCUTS</dt>
            <dd>{overlayState.shortcutReady ? "READY" : "UNAVAILABLE"}</dd>
          </div>
          <div>
            <dt>LAST FILE</dt>
            <dd title={status.lastFilename ?? ""}>{status.lastFilename ?? "-"}</dd>
          </div>
          <div>
            <dt>INTEL BUILD</dt>
            <dd>{dataGeneratedAt ? new Date(dataGeneratedAt).toLocaleDateString() : "UNKNOWN"}</dd>
          </div>
          <div>
            <dt>EXTRACT OCR</dt>
            <dd>{raidExtracts?.status.toUpperCase() ?? "UNKNOWN"}</dd>
          </div>
        </dl>
        <p className={`diagnostic-status ${status.level}`}>{status.message}</p>
        {(overlayState.lastError || status.lastError) && (
          <p className="error-box">{overlayState.lastError ?? status.lastError}</p>
        )}
      </div>
    </Dialog>
  );
}

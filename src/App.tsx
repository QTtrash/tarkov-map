import { useCallback, useEffect, useMemo, useState } from "react";
import { IntelDrawer } from "./components/IntelDrawer";
import { UiIcon } from "./components/Icons";
import { MapView } from "./components/MapView";
import { QuestPanel } from "./components/QuestPanel";
import { SharePanel } from "./components/SharePanel";
import { SettingsDialog } from "./components/SettingsDialog";
import { AboutDialog } from "./components/AboutDialog";
import { getMapDefinition, maps } from "./data/maps";
import { getActiveFloor } from "./floor";
import {
  chooseDirectory,
  clearPlayerPosition,
  defaultSettings,
  getLocatorSnapshot,
  getOverlayState,
  loadSettings,
  openDirectory,
  registerGlobalShortcuts,
  rescanDirectories,
  saveSettings,
  subscribeLocator,
  subscribeOverlayState,
  toggleOverlay,
} from "./locator";
import { applyDetectedContext, returnToDetectedMap, selectViewedMap, type MapSessionState } from "./map-session";
import { composePoiBundle, composeVisibleCategories } from "./map-overlays";
import { defaultVisiblePoiCategories, loadPoiBundle } from "./poi";
import { recognizeRaidExtracts } from "./raid";
import type {
  CustomPinPoi,
  LocatorSettings,
  LocatorStatus,
  MapAssetState,
  MapPoiBundle,
  OcrTextCapture,
  OverlayState,
  PlayerFix,
  PoiCategory,
  QuestObjectivePoi,
  RaidExtractState,
  SquadPosition,
} from "./types";
import { parseCustomPins, readStoredJson } from "./validation";

const initialStatus: LocatorStatus = {
  level: "info",
  message: "Starting locator...",
  screenshotsDir: null,
  logsDir: null,
  screenshotWatcherReady: false,
  logWatcherReady: false,
  lastFilename: null,
  lastError: null,
};

const allPoiCategories = new Set<string>([
  "extract-pmc",
  "extract-scav",
  "extract-shared",
  "transit",
  "switch",
  "hazard",
  "btr",
  "spawn-pmc",
  "spawn-scav",
  "spawn-boss",
  "spawn-sniper",
  "spawn-other",
  "loot",
  "stationary-weapon",
  "boss-zone",
  "locked-door",
  "quest-objective",
  "custom-pin",
]);

function coordinate(value: number) {
  return value.toFixed(2);
}

function elapsedLabel(observedAt: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - observedAt) / 1000));
  if (seconds < 2) return "JUST NOW";
  if (seconds < 60) return `${seconds} SEC AGO`;
  return `${Math.floor(seconds / 60)} MIN AGO`;
}

function normalizedVisibleLayers(layers: string[]) {
  const filtered = layers.filter((layer): layer is PoiCategory => allPoiCategories.has(layer));
  return filtered.length || layers.length === 0 ? filtered : defaultVisiblePoiCategories;
}

export function App() {
  const [settings, setSettings] = useState<LocatorSettings>(defaultSettings);
  const [status, setStatus] = useState<LocatorStatus>(initialStatus);
  const [fix, setFix] = useState<PlayerFix | null>(null);
  const [squadPositions, setSquadPositions] = useState<SquadPosition[]>([]);
  const [mapSession, setMapSession] = useState<MapSessionState>({
    viewedMapId: defaultSettings.selectedMap,
    detectedMapId: null,
    inRaid: false,
    source: "manual",
    browsingAway: false,
  });
  const [floorMode, setFloorMode] = useState("auto");
  const [poiBundle, setPoiBundle] = useState<MapPoiBundle | null>(null);
  const [poiLoading, setPoiLoading] = useState(true);
  const [poiError, setPoiError] = useState<string | null>(null);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [focusPoiId, setFocusPoiId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
  const [showSharing, setShowSharing] = useState(false);
  const [activeQuestPois, setActiveQuestPois] = useState<QuestObjectivePoi[]>([]);
  const [focusedQuestPoi, setFocusedQuestPoi] = useState<QuestObjectivePoi | null>(null);
  const [customPins, setCustomPins] = useState<CustomPinPoi[]>(() =>
    readStoredJson("raid-signal-custom-pins", parseCustomPins, []),
  );
  const [now, setNow] = useState(Date.now());
  const [lastOcr, setLastOcr] = useState<OcrTextCapture | null>(null);
  const [raidExtracts, setRaidExtracts] = useState<RaidExtractState | null>(null);
  const [dataGeneratedAt, setDataGeneratedAt] = useState<string | null>(null);
  const [overlayState, setOverlayState] = useState<OverlayState>({
    visible: false,
    ready: false,
    clickThrough: false,
    shortcutReady: false,
    lastError: null,
  });
  const [mapAssetState, setMapAssetState] = useState<MapAssetState>({ status: "idle", asset: null, message: null });
  const [mapRetry, setMapRetry] = useState(0);

  useEffect(() => {
    void registerGlobalShortcuts().catch((error) => {
      setStatus((current) => ({
        ...current,
        level: "warning",
        message: "Global shortcuts unavailable",
        lastError: String(error),
      }));
    });
    void loadSettings()
      .then((loaded) => {
        setSettings({
          ...loaded,
          visibleMapLayers: normalizedVisibleLayers(loaded.visibleMapLayers ?? defaultVisiblePoiCategories),
          legendOpen: loaded.legendOpen ?? false,
        });
        if (getMapDefinition(loaded.selectedMap)) {
          setMapSession((current) => (current.inRaid ? current : selectViewedMap(current, loaded.selectedMap)));
        }
        if (!loaded.autoFloor) setFloorMode(getMapDefinition(loaded.selectedMap)?.baseFloor.id ?? "auto");
      })
      .catch((error) => {
        setStatus((current) => ({
          ...current,
          level: "error",
          message: "Could not load settings",
          lastError: String(error),
        }));
      });
    let cleanup: (() => void) | undefined;
    let disposed = false;
    const applyContext = (context: Parameters<typeof applyDetectedContext>[1]) => {
      const safeContext = { ...context, mapId: getMapDefinition(context.mapId) ? context.mapId : null };
      setMapSession((current) => applyDetectedContext(current, safeContext));
      if (!context.inRaid) setRaidExtracts(null);
    };
    void subscribeLocator({
      onFix: (nextFix) => {
        setFix(nextFix);
        setNow(Date.now());
      },
      onStatus: setStatus,
      onMapContext: applyContext,
      onClear: () => setFix(null),
      onOcrText: setLastOcr,
    }).then((unlisten) => {
      if (disposed) unlisten();
      else {
        cleanup = unlisten;
        void getLocatorSnapshot()
          .then((snapshot) => {
            setFix(snapshot.fix);
            applyContext(snapshot.mapContext);
            if (snapshot.status) setStatus(snapshot.status);
            setLastOcr(snapshot.ocrText);
          })
          .catch((error) => {
            setStatus((current) => ({
              ...current,
              level: "warning",
              message: "Could not restore locator state",
              lastError: String(error),
            }));
          })
          .finally(() => void rescanDirectories());
      }
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let disposed = false;
    void Promise.all([
      getOverlayState().then(setOverlayState),
      subscribeOverlayState(setOverlayState).then((unlisten) => {
        if (disposed) unlisten();
        else cleanup = unlisten;
      }),
    ]).catch(() => undefined);
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => localStorage.setItem("raid-signal-custom-pins", JSON.stringify(customPins)), [customPins]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setSquadPositions((current) => current.filter((position) => Date.now() - position.receivedAt < 120_000)),
      5_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const receiveSquadPosition = useCallback((position: SquadPosition) => {
    setSquadPositions((current) => [...current.filter((entry) => entry.senderId !== position.senderId), position]);
  }, []);

  useEffect(() => {
    void fetch("/maps/data-manifest.json")
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ generatedAt?: string }>)
          : Promise.reject(new Error("manifest unavailable")),
      )
      .then((manifest) => setDataGeneratedAt(manifest.generatedAt ?? null))
      .catch(() => setDataGeneratedAt(null));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowSettings(false);
        setShowAbout(false);
        setShowQuests(false);
        setShowSharing(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setSettings((current) => ({ ...current, legendOpen: true }));
        window.setTimeout(() => document.querySelector<HTMLInputElement>(".intel-search input")?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const definition = getMapDefinition(mapSession.viewedMapId) ?? maps[0];
  const detectedDefinition = getMapDefinition(mapSession.detectedMapId);
  useEffect(() => {
    setFocusedQuestPoi(null);
  }, [definition.id]);
  const visibleFix = fix && (!fix.mapId || fix.mapId === definition.id) ? fix : null;
  const activeFloor = useMemo(
    () => (definition ? getActiveFloor(definition, visibleFix?.position ?? null, floorMode) : "base"),
    [definition, visibleFix?.position, floorMode],
  );
  const visiblePoiCategories = useMemo(
    () => new Set(normalizedVisibleLayers(settings.visibleMapLayers ?? defaultVisiblePoiCategories)),
    [settings.visibleMapLayers],
  );
  const renderedCategories = useMemo(
    () =>
      composeVisibleCategories(
        visiblePoiCategories,
        definition.id,
        activeQuestPois,
        focusedQuestPoi,
        customPins,
        settings.showQuestMarkers,
      ),
    [activeQuestPois, customPins, definition.id, focusedQuestPoi, settings.showQuestMarkers, visiblePoiCategories],
  );
  const renderedPoiBundle = useMemo<MapPoiBundle | null>(
    () =>
      composePoiBundle(
        poiBundle,
        definition.id,
        activeQuestPois,
        focusedQuestPoi,
        customPins,
        settings.showQuestMarkers,
      ),
    [activeQuestPois, customPins, definition.id, focusedQuestPoi, poiBundle, settings.showQuestMarkers],
  );

  useEffect(() => {
    if (!definition) return;
    const controller = new AbortController();
    setPoiBundle(null);
    setPoiLoading(true);
    setPoiError(null);
    setSelectedPoiId(null);
    setFocusPoiId(null);
    void loadPoiBundle(definition.poiPath, controller.signal)
      .then(setPoiBundle)
      .catch((error) => {
        if (!controller.signal.aborted) setPoiError(String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPoiLoading(false);
      });
    return () => controller.abort();
  }, [definition]);

  useEffect(() => {
    if (!lastOcr || !poiBundle) return;
    const mapId = lastOcr.mapId && getMapDefinition(lastOcr.mapId) ? lastOcr.mapId : definition.id;
    if (mapId !== definition.id) return;
    setRaidExtracts(recognizeRaidExtracts(lastOcr, mapId, poiBundle.pois));
  }, [definition.id, lastOcr, poiBundle]);

  const updateSettings = useCallback((patch: Partial<LocatorSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void saveSettings(next).catch((error) => {
        setStatus((value) => ({
          ...value,
          level: "error",
          message: "Could not save settings",
          lastError: String(error),
        }));
      });
      return next;
    });
  }, []);

  const viewMap = useCallback(
    (mapId: string) => {
      if (!getMapDefinition(mapId)) return;
      setMapSession((current) => selectViewedMap(current, mapId));
      updateSettings({ selectedMap: mapId, autoFloor: true });
      setFocusedQuestPoi(null);
      setFloorMode("auto");
    },
    [updateSettings],
  );

  const returnToRaid = useCallback(() => {
    setMapSession((current) => {
      const next = returnToDetectedMap(current);
      if (next.viewedMapId !== current.viewedMapId) updateSettings({ selectedMap: next.viewedMapId, autoFloor: true });
      return next;
    });
    setFocusedQuestPoi(null);
    setFloorMode("auto");
  }, [updateSettings]);

  const setFollow = useCallback((followPlayer: boolean) => updateSettings({ followPlayer }), [updateSettings]);
  const selectPoi = useCallback((id: string | null) => setSelectedPoiId(id), []);

  const setVisiblePoiCategories = useCallback(
    (categories: PoiCategory[]) => {
      updateSettings({ visibleMapLayers: categories });
    },
    [updateSettings],
  );

  const togglePoiCategory = useCallback((category: PoiCategory) => {
    setSettings((current) => {
      const nextLayers = new Set(normalizedVisibleLayers(current.visibleMapLayers ?? defaultVisiblePoiCategories));
      if (nextLayers.has(category)) nextLayers.delete(category);
      else nextLayers.add(category);
      const next = { ...current, visibleMapLayers: [...nextLayers] };
      void saveSettings(next).catch((error) => {
        setStatus((value) => ({
          ...value,
          level: "error",
          message: "Could not save layer settings",
          lastError: String(error),
        }));
      });
      return next;
    });
  }, []);

  const focusPoi = useCallback(
    (id: string) => {
      const poi = renderedPoiBundle?.pois.find((candidate) => candidate.id === id);
      if (poi && !visiblePoiCategories.has(poi.category)) {
        setVisiblePoiCategories([...visiblePoiCategories, poi.category]);
      }
      setSelectedPoiId(id);
      setFocusPoiId(id);
    },
    [renderedPoiBundle, setVisiblePoiCategories, visiblePoiCategories],
  );

  const focusQuestObjective = useCallback(
    (mapId: string, poi: QuestObjectivePoi | null) => {
      viewMap(mapId);
      setFocusedQuestPoi(poi);
      if (poi) updateSettings({ showQuestMarkers: true });
      setShowQuests(false);
      setSelectedPoiId(poi?.id ?? null);
      setFocusPoiId(poi?.id ?? null);
    },
    [updateSettings, viewMap],
  );

  const createWaypoint = useCallback(
    (position: { x: number; z: number }) => {
      const pin: CustomPinPoi = {
        id: `pin-${definition.id}-${crypto.randomUUID()}`,
        kind: "custom-pin",
        category: "custom-pin",
        name: "Custom waypoint",
        note: "Double-clicked map waypoint",
        position: { x: position.x, y: 0, z: position.z },
      };
      setCustomPins((current) => [...current, pin]);
      setSelectedPoiId(pin.id);
      setFocusPoiId(pin.id);
    },
    [definition.id],
  );

  async function browse(kind: "screenshots" | "logs") {
    try {
      setSettings(await chooseDirectory(kind));
    } catch (error) {
      setStatus((current) => ({
        ...current,
        level: "error",
        message: "Folder selection failed",
        lastError: String(error),
      }));
    }
  }

  async function runOverlayAction(action: () => Promise<void>, failureMessage: string) {
    try {
      await action();
      setOverlayState(await getOverlayState());
    } catch (error) {
      setStatus((current) => ({ ...current, level: "error", message: failureMessage, lastError: String(error) }));
      setOverlayState((current) => ({ ...current, lastError: String(error) }));
    }
  }

  if (!definition) {
    return (
      <main className="empty-state">
        <div className="spinner" />
        <h1>Map assets are unavailable</h1>
        <p>
          Run <code>npm run assets:sync</code>, then restart.
        </p>
      </main>
    );
  }

  const floors = [definition.baseFloor, ...definition.floors.map(({ id, name }) => ({ id, name }))];
  const stale = fix ? now - fix.observedAt >= 60_000 : false;
  const visibleCount = poiBundle?.pois.filter((poi) => visiblePoiCategories.has(poi.category)).length ?? 0;
  const activeExtractIds = useMemo(() => new Set(raidExtracts?.activeExtractIds ?? []), [raidExtracts]);

  return (
    <main className={settings.highContrast ? "app-shell high-contrast" : "app-shell"}>
      <header className="command-bar">
        <div className="brand-lockup">
          <span className="brand-sigil">RS</span>
          <div>
            <strong>RAID SIGNAL</strong>
            <span>FIELD POSITION SYSTEM</span>
          </div>
        </div>

        <div className="command-selects">
          <label className="command-field">
            <span>LOCATION</span>
            <select
              value={definition.id}
              onChange={(event) => {
                viewMap(event.target.value);
              }}
            >
              {maps.map((map) => (
                <option value={map.id} key={map.id}>
                  {map.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="command-field">
            <span>LEVEL</span>
            <select
              value={floorMode}
              onChange={(event) => {
                setFloorMode(event.target.value);
                updateSettings({ autoFloor: event.target.value === "auto" });
              }}
            >
              <option value="auto">
                AUTO / {floors.find((floor) => floor.id === activeFloor)?.name.toUpperCase() ?? "MAIN"}
              </option>
              {floors.map((floor) => (
                <option value={floor.id} key={floor.id}>
                  {floor.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="command-actions">
          <span className={status.screenshotWatcherReady ? "system-chip online" : "system-chip"}>
            <i />
            {status.screenshotWatcherReady ? "LOCATOR ONLINE" : "LOCATOR OFFLINE"}
          </span>
          <button
            className={settings.followPlayer ? "command-button active" : "command-button"}
            onClick={() => setFollow(!settings.followPlayer)}
          >
            <UiIcon name="target" />
            {settings.followPlayer ? "FOLLOWING" : "FOLLOW"}
          </button>
          <button
            className={overlayState.visible ? "command-button active" : "command-button"}
            onClick={() => void runOverlayAction(toggleOverlay, "Overlay could not be toggled")}
            title="Toggle compact overlay (Ctrl+Shift+M)"
          >
            {overlayState.visible ? "HIDE OVERLAY" : "OVERLAY"}
          </button>
          <button
            className={settings.alwaysOnTop ? "icon-command active" : "icon-command"}
            onClick={() => updateSettings({ alwaysOnTop: !settings.alwaysOnTop })}
            aria-label="Pin window"
            title="Pin window"
          >
            <UiIcon name="pin" />
          </button>
          <button className="icon-command" onClick={() => setShowSettings(true)} aria-label="Settings">
            <UiIcon name="settings" />
          </button>
          <button className="icon-command" onClick={() => setShowAbout(true)} aria-label="About">
            <UiIcon name="info" />
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="telemetry-panel">
          <div className="telemetry-heading">
            <span>POSITION TELEMETRY</span>
            <b className={stale ? "stale" : ""}>{fix ? elapsedLabel(fix.observedAt, now) : "NO FIX"}</b>
          </div>
          {fix ? (
            <>
              <div className="coordinate-stack">
                <div>
                  <span>X / EAST</span>
                  <strong>{coordinate(fix.position.x)}</strong>
                </div>
                <div>
                  <span>Y / ELEV</span>
                  <strong>{coordinate(fix.position.y)}</strong>
                </div>
                <div>
                  <span>Z / NORTH</span>
                  <strong>{coordinate(fix.position.z)}</strong>
                </div>
              </div>
              <dl className="telemetry-list">
                <div>
                  <dt>RAID LOCATION</dt>
                  <dd>
                    {getMapDefinition(fix.mapId)?.displayName ?? detectedDefinition?.displayName ?? "UNCONFIRMED"}
                  </dd>
                </div>
                <div>
                  <dt>LEVEL</dt>
                  <dd>{floors.find((floor) => floor.id === activeFloor)?.name ?? activeFloor}</dd>
                </div>
                <div>
                  <dt>VECTOR</dt>
                  <dd>{fix.forward ? "HEADING LOCK" : "POSITION ONLY"}</dd>
                </div>
                {fix.gameTime !== null && (
                  <div>
                    <dt>LOCAL TIME</dt>
                    <dd>{fix.gameTime.toFixed(2)}</dd>
                  </div>
                )}
              </dl>
              <button
                className="inline-action"
                onClick={() => {
                  setFix(null);
                  void clearPlayerPosition();
                }}
              >
                CLEAR POSITION
              </button>
            </>
          ) : (
            <div className="awaiting-fix">
              <span className="scan-reticle">
                <i />
              </span>
              <strong>AWAITING SCREENSHOT</strong>
              <p>Take an in-game screenshot to acquire your position.</p>
            </div>
          )}

          <div className="panel-rule" />
          <div className="telemetry-heading">
            <span>MAP INTELLIGENCE</span>
            <b>{poiLoading ? "SYNC" : `${visibleCount} SHOWN`}</b>
          </div>
          <div className="intel-summary">
            <div>
              <strong>{Object.values(definition.poiCounts).reduce((sum, count) => sum + (count ?? 0), 0)}</strong>
              <span>KNOWN POINTS</span>
            </div>
            <div>
              <strong>
                {(definition.poiCounts["extract-pmc"] ?? 0) +
                  (definition.poiCounts["extract-scav"] ?? 0) +
                  (definition.poiCounts["extract-shared"] ?? 0)}
              </strong>
              <span>EXTRACTS</span>
            </div>
          </div>
          <button className="panel-button" onClick={() => updateSettings({ legendOpen: true })}>
            <UiIcon name="layers" />
            OPEN INTELLIGENCE
          </button>
          <button className="panel-button secondary" onClick={() => setShowQuests(true)}>
            QUEST NAVIGATOR
          </button>
          <button className="panel-button secondary" onClick={() => setShowSharing(true)}>
            PHONE / SQUAD LINK
          </button>

          <div className="panel-status">
            <div>
              <i className={status.screenshotWatcherReady ? "ready" : ""} />
              <span>SCREENSHOT WATCHER</span>
              <b>{status.screenshotWatcherReady ? "READY" : "CHECK PATH"}</b>
            </div>
            <div>
              <i className={status.logWatcherReady ? "ready" : ""} />
              <span>RAID DETECTION</span>
              <b>{status.logWatcherReady ? "READY" : "MANUAL"}</b>
            </div>
          </div>
          <footer>
            <span>NOT AFFILIATED WITH BATTLESTATE GAMES</span>
            <a href={definition.attribution.url} target="_blank" rel="noreferrer">
              MAP BY {definition.attribution.name.toUpperCase()}
            </a>
          </footer>
        </aside>

        <div className="map-region">
          <MapView
            key={`${definition.id}-${mapRetry}`}
            definition={definition}
            activeFloor={activeFloor}
            fix={visibleFix}
            squadPositions={squadPositions}
            follow={settings.followPlayer}
            poiBundle={renderedPoiBundle}
            visiblePoiCategories={renderedCategories}
            selectedPoiId={selectedPoiId}
            focusPoiId={focusPoiId}
            activeExtractIds={activeExtractIds}
            onFollowChange={setFollow}
            onSelectPoi={selectPoi}
            onCreateWaypoint={createWaypoint}
            onAssetStateChange={setMapAssetState}
          />
          <div className="map-title-plate">
            <span>{mapSession.browsingAway ? "BROWSING MAP" : "ACTIVE MAP"}</span>
            <strong>{definition.displayName}</strong>
            <small>
              {floors.find((floor) => floor.id === activeFloor)?.name} /{" "}
              {mapSession.inRaid ? "RAID DETECTED" : "MANUAL CONTEXT"}
            </small>
          </div>
          {mapSession.browsingAway && detectedDefinition && (
            <div className="raid-map-banner">
              <span>
                Raid telemetry remains on <b>{detectedDefinition.displayName}</b>
              </span>
              <button onClick={returnToRaid}>RETURN TO RAID</button>
            </div>
          )}
          {mapAssetState.status === "error" && (
            <div className="map-asset-error">
              <strong>MAP COULD NOT LOAD</strong>
              <span>{mapAssetState.message}</span>
              <button onClick={() => setMapRetry((value) => value + 1)}>RETRY MAP</button>
            </div>
          )}
          {!settings.followPlayer && visibleFix && (
            <button className="floating-follow" onClick={() => setFollow(true)}>
              <UiIcon name="center" />
              CENTER ON PLAYER
            </button>
          )}
          {customPins.some((pin) => pin.id.startsWith(`pin-${definition.id}-`)) && (
            <button
              className="clear-waypoints"
              onClick={() =>
                setCustomPins((current) => current.filter((pin) => !pin.id.startsWith(`pin-${definition.id}-`)))
              }
            >
              CLEAR WAYPOINTS
            </button>
          )}
          <IntelDrawer
            definition={definition}
            bundle={renderedPoiBundle}
            loading={poiLoading}
            error={poiError}
            open={settings.legendOpen}
            visible={visiblePoiCategories}
            fix={visibleFix}
            raidExtracts={raidExtracts}
            showQuestMarkers={settings.showQuestMarkers}
            activeQuestCount={activeQuestPois.filter((poi) => poi.mapId === definition.id).length}
            onOpenChange={(legendOpen) => updateSettings({ legendOpen })}
            onToggle={togglePoiCategory}
            onToggleQuestMarkers={() => updateSettings({ showQuestMarkers: !settings.showQuestMarkers })}
            onHideAll={() => {
              setFocusedQuestPoi(null);
              updateSettings({ visibleMapLayers: [], showQuestMarkers: false });
            }}
            onSetVisible={setVisiblePoiCategories}
            onFocusPoi={focusPoi}
          />
        </div>
      </section>

      <QuestPanel
        open={showQuests}
        mapId={definition.id}
        onClose={() => setShowQuests(false)}
        onFocusObjective={focusQuestObjective}
        onActiveObjectivePoisChange={setActiveQuestPois}
      />
      <SharePanel
        open={showSharing}
        fix={fix}
        mapId={definition.id}
        onClose={() => setShowSharing(false)}
        onSquadPosition={receiveSquadPosition}
        onSessionEnd={() => setSquadPositions([])}
      />

      {showSettings && (
        <SettingsDialog
          settings={settings}
          status={status}
          mapSession={mapSession}
          overlayState={overlayState}
          dataGeneratedAt={dataGeneratedAt}
          raidExtracts={raidExtracts}
          onClose={() => setShowSettings(false)}
          onBrowse={browse}
          onOpenDirectory={openDirectory}
          onUpdateSettings={updateSettings}
          onOverlayAction={runOverlayAction}
        />
      )}

      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}
    </main>
  );
}

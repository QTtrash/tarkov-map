import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getMapDefinition, maps } from "../data/maps";
import { getActiveFloor } from "../floor";
import { defaultSettings, hideOverlay, loadSettings, overlayReady, setOverlayClickThrough, subscribeLocator } from "../locator";
import { defaultVisiblePoiCategories, loadPoiBundle } from "../poi";
import { recognizeRaidExtracts } from "../raid";
import type { LocatorSettings, MapAssetState, MapContext, MapPoiBundle, OcrTextCapture, PlayerFix, PoiCategory, RaidExtractState } from "../types";
import { UiIcon } from "./Icons";
import { MapView } from "./MapView";

const noop = () => undefined;
const idleAsset: MapAssetState = { status: "idle", asset: null, message: null };

export function OverlayApp() {
  const [settings, setSettings] = useState<LocatorSettings>(defaultSettings);
  const [fix, setFix] = useState<PlayerFix | null>(null);
  const [context, setContext] = useState<MapContext>({ mapId: null, inRaid: false, source: "manual" });
  const [bundle, setBundle] = useState<MapPoiBundle | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [capture, setCapture] = useState<OcrTextCapture | null>(null);
  const [raidExtracts, setRaidExtracts] = useState<RaidExtractState | null>(null);
  const [assetState, setAssetState] = useState<MapAssetState>(idleAsset);
  const [retryKey, setRetryKey] = useState(0);
  const [clickThroughCountdown, setClickThroughCountdown] = useState<number | null>(null);

  useEffect(() => {
    void setOverlayClickThrough(false);
    void loadSettings().then(setSettings);
    let cleanup: (() => void) | undefined;
    let cleanupInvalidate: (() => void) | undefined;
    void subscribeLocator({
      onFix: setFix,
      onStatus: noop,
      onMapContext: (next) => { setContext(next); if (!next.inRaid) setRaidExtracts(null); },
      onClear: () => setFix(null),
      onOcrText: setCapture,
      onSettings: setSettings,
    }).then((unlisten) => { cleanup = unlisten; });
    void listen("overlay://invalidate-map", () => setRetryKey((current) => current + 1)).then((unlisten) => { cleanupInvalidate = unlisten; });
    const readyFrame = window.requestAnimationFrame(() => void overlayReady());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") void hideOverlay();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(readyFrame);
      window.removeEventListener("keydown", onKeyDown);
      cleanup?.();
      cleanupInvalidate?.();
    };
  }, []);

  useEffect(() => {
    if (clickThroughCountdown === null) return;
    if (clickThroughCountdown <= 0) {
      setClickThroughCountdown(null);
      void setOverlayClickThrough(true);
      return;
    }
    const timer = window.setTimeout(() => setClickThroughCountdown((current) => current === null ? null : current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [clickThroughCountdown]);

  const definition = getMapDefinition(context.mapId ?? settings.selectedMap) ?? maps[0];
  const floor = getActiveFloor(definition, fix?.position ?? null, "auto");
  useEffect(() => {
    const controller = new AbortController();
    setBundle(null);
    setBundleError(null);
    void loadPoiBundle(definition.poiPath, controller.signal)
      .then(setBundle)
      .catch((reason) => { if (!controller.signal.aborted) setBundleError(String(reason)); });
    return () => controller.abort();
  }, [definition, retryKey]);
  useEffect(() => {
    if (capture && bundle) setRaidExtracts(recognizeRaidExtracts(capture, definition.id, bundle.pois));
  }, [bundle, capture, definition.id]);
  const visible = useMemo(() => new Set((settings.visibleMapLayers.length ? settings.visibleMapLayers : defaultVisiblePoiCategories) as PoiCategory[]), [settings.visibleMapLayers]);
  const active = useMemo(() => new Set(raidExtracts?.activeExtractIds ?? []), [raidExtracts]);
  const onAssetStateChange = useCallback((next: MapAssetState) => setAssetState(next), []);
  const retry = () => {
    setAssetState(idleAsset);
    setRetryKey((current) => current + 1);
  };

  return <main className="overlay-shell" style={{ opacity: settings.overlayOpacity }}>
    <header className="overlay-bar" data-tauri-drag-region>
      <div data-tauri-drag-region><span>{definition.displayName}</span><b>{fix ? "POSITION LIVE" : "AWAITING FIX"}</b></div>
      <div>
        <button onClick={() => setClickThroughCountdown(3)} title="Enable click-through after a countdown; Ctrl+Shift+X restores interaction" aria-label="Enable click-through"><UiIcon name="pin" size={15} /></button>
        <button onClick={() => void hideOverlay()} aria-label="Hide overlay"><UiIcon name="close" size={15} /></button>
      </div>
    </header>
    <section className="overlay-map">
      <MapView key={`${definition.id}:${floor}:${retryKey}`} definition={definition} activeFloor={floor} fix={fix} follow poiBundle={bundle} visiblePoiCategories={visible} selectedPoiId={null} focusPoiId={null} activeExtractIds={active} onFollowChange={noop} onSelectPoi={noop} onAssetStateChange={onAssetStateChange} />
      {(assetState.status === "loading" || !bundle) && !bundleError && <div className="overlay-state"><span className="spinner" /><strong>LOADING {definition.displayName.toUpperCase()}</strong></div>}
      {(assetState.status === "error" || bundleError) && <div className="overlay-state error"><strong>MAP COULD NOT LOAD</strong><small>{assetState.status === "error" ? assetState.message : bundleError}</small><button onClick={retry}>RETRY</button></div>}
      {clickThroughCountdown !== null && <div className="overlay-countdown"><strong>CLICK-THROUGH IN {clickThroughCountdown}</strong><span>Ctrl+Shift+X always restores control</span><button onClick={() => setClickThroughCountdown(null)}>CANCEL</button></div>}
      <div className="overlay-readout"><strong>{raidExtracts?.status === "recognized" ? `${raidExtracts.activeExtractIds.length} ACTIVE EXITS` : "EXITS UNKNOWN"}</strong><span>{fix ? `${fix.position.x.toFixed(1)} / ${fix.position.z.toFixed(1)}` : "TAKE SCREENSHOT"}</span></div>
    </section>
  </main>;
}

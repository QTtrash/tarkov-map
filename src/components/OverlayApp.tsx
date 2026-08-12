import { useEffect, useMemo, useState } from "react";
import { getMapDefinition, maps } from "../data/maps";
import { getActiveFloor } from "../floor";
import { defaultSettings, loadSettings, setOverlayClickThrough, subscribeLocator, toggleOverlay } from "../locator";
import { defaultVisiblePoiCategories, loadPoiBundle } from "../poi";
import { recognizeRaidExtracts } from "../raid";
import type { LocatorSettings, MapContext, MapPoiBundle, OcrTextCapture, PlayerFix, PoiCategory, RaidExtractState } from "../types";
import { UiIcon } from "./Icons";
import { MapView } from "./MapView";

const noop = () => undefined;

export function OverlayApp() {
  const [settings, setSettings] = useState<LocatorSettings>(defaultSettings);
  const [fix, setFix] = useState<PlayerFix | null>(null);
  const [context, setContext] = useState<MapContext>({ mapId: null, inRaid: false, source: "manual" });
  const [bundle, setBundle] = useState<MapPoiBundle | null>(null);
  const [capture, setCapture] = useState<OcrTextCapture | null>(null);
  const [raidExtracts, setRaidExtracts] = useState<RaidExtractState | null>(null);

  useEffect(() => {
    void loadSettings().then(setSettings);
    let cleanup: (() => void) | undefined;
    void subscribeLocator({
      onFix: setFix,
      onStatus: noop,
      onMapContext: (next) => { setContext(next); if (!next.inRaid) setRaidExtracts(null); },
      onClear: () => setFix(null),
      onOcrText: setCapture,
      onSettings: setSettings,
    }).then((unlisten) => { cleanup = unlisten; });
    return () => cleanup?.();
  }, []);

  const definition = getMapDefinition(context.mapId ?? settings.selectedMap) ?? maps[0];
  const floor = getActiveFloor(definition, fix?.position ?? null, "auto");
  useEffect(() => {
    const controller = new AbortController();
    setBundle(null);
    void loadPoiBundle(definition.poiPath, controller.signal).then(setBundle).catch(() => undefined);
    return () => controller.abort();
  }, [definition]);
  useEffect(() => {
    if (capture && bundle) setRaidExtracts(recognizeRaidExtracts(capture, definition.id, bundle.pois));
  }, [bundle, capture, definition.id]);
  const visible = useMemo(() => new Set((settings.visibleMapLayers.length ? settings.visibleMapLayers : defaultVisiblePoiCategories) as PoiCategory[]), [settings.visibleMapLayers]);
  const active = useMemo(() => new Set(raidExtracts?.activeExtractIds ?? []), [raidExtracts]);

  return <main className="overlay-shell" style={{ opacity: settings.overlayOpacity }}>
    <header className="overlay-bar" data-tauri-drag-region>
      <div data-tauri-drag-region><span>{definition.displayName}</span><b>{fix ? "POSITION LIVE" : "AWAITING FIX"}</b></div>
      <div><button onClick={() => void setOverlayClickThrough(true)} title="Enable click-through; Ctrl+Shift+X restores interaction" aria-label="Enable click-through"><UiIcon name="pin" size={15} /></button><button onClick={() => void toggleOverlay()} aria-label="Hide overlay"><UiIcon name="close" size={15} /></button></div>
    </header>
    <section className="overlay-map">
      <MapView definition={definition} activeFloor={floor} fix={fix} follow poiBundle={bundle} visiblePoiCategories={visible} selectedPoiId={null} focusPoiId={null} activeExtractIds={active} onFollowChange={noop} onSelectPoi={noop} />
      <div className="overlay-readout"><strong>{raidExtracts?.status === "recognized" ? `${raidExtracts.activeExtractIds.length} ACTIVE EXITS` : "EXITS UNKNOWN"}</strong><span>{fix ? `${fix.position.x.toFixed(1)} / ${fix.position.z.toFixed(1)}` : "TAKE SCREENSHOT"}</span></div>
    </section>
  </main>;
}

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { getMapDefinition } from "../data/maps";
import { chooseAutomaticFloor } from "../floor";
import { prepareSvgMap, versionedMapAssetPath } from "../map-assets";
import type { QuestObjectivePoi } from "../types";
import { assetForFloor, createMapCrs, mapBounds, worldPoint } from "./map-view-helpers";

export function QuestLocationPreview({ poi }: { poi: QuestObjectivePoi }) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const definition = getMapDefinition(poi.mapId);
  const floor = definition ? chooseAutomaticFloor(definition, poi.position) : null;
  useEffect(() => {
    if (!container.current || !definition || !floor) return;
    let disposed = false;
    const controller = new AbortController();
    const map = L.map(container.current, {
      crs: createMapCrs(definition),
      attributionControl: false,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
      zoomAnimation: false,
      fadeAnimation: false,
    }).setView(worldPoint(poi.position), Math.min(definition.maxZoom, definition.minZoom + 2));
    const resize = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    resize.observe(container.current);
    setState("loading");
    const load = async () => {
      const asset = assetForFloor(definition, floor);
      if (asset.type === "tiles") throw new Error("Preview artwork unavailable");
      if (!/^\/maps\/(svg|image)\/[a-zA-Z0-9_./-]+$/.test(asset.path) || asset.path.includes(".."))
        throw new Error("Invalid preview asset");
      const path = await versionedMapAssetPath(asset.path);
      let image = path;
      let bounds = mapBounds(definition, true);
      if (asset.type === "svg") {
        const response = await fetch(path, { signal: controller.signal });
        if (!response.ok) throw new Error("Preview unavailable");
        const source = await response.text();
        if (source.length > 8_000_000) throw new Error("Preview is too large");
        const svg = prepareSvgMap(source, definition, floor);
        // An SVG image document cannot execute scripts or embed interactive wiki HTML.
        image = `data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
      } else {
        bounds = L.latLngBounds([asset.bounds[0][1], asset.bounds[0][0]], [asset.bounds[1][1], asset.bounds[1][0]]);
      }
      if (disposed) return;
      L.imageOverlay(image, bounds, { interactive: false })
        .once("load", () => {
          if (!disposed) setState("ready");
        })
        .once("error", () => {
          if (!disposed) setState("error");
        })
        .addTo(map);
      if (poi.outline?.length)
        L.polygon(poi.outline.map(worldPoint), { color: "#ffbb66", weight: 2, interactive: false }).addTo(map);
      L.circleMarker(worldPoint(poi.position), {
        radius: 7,
        color: "#fff5db",
        weight: 2,
        fillColor: "#dc7d2b",
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
    };
    void load().catch(() => {
      if (!disposed) setState("error");
    });
    return () => {
      disposed = true;
      controller.abort();
      resize.disconnect();
      map.remove();
    };
  }, [definition, floor, poi, retry]);

  if (!definition || !floor) return <p>Location map unavailable. The objective text is still available.</p>;
  const floorName = [definition.baseFloor, ...definition.floors].find((candidate) => candidate.id === floor)?.name;
  return (
    <figure className="quest-location-preview">
      <div
        ref={container}
        className="quest-preview-map"
        role="img"
        aria-label={`${poi.name}: objective location on ${definition.displayName}, ${floorName}`}
      />
      {state === "loading" && <p role="status">Loading location map…</p>}
      {state === "error" && (
        <p role="status">
          Location map unavailable. <button onClick={() => setRetry((value) => value + 1)}>Retry preview</button>
        </p>
      )}
      <figcaption>
        Objective location map · {definition.displayName} · {floorName}
        <br />
        Map by {definition.attribution.name} · CC BY-NC-SA 4.0
      </figcaption>
    </figure>
  );
}

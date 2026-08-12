import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import { poiMatchesFloor } from "../poi";
import type { MapAsset, MapAssetState, MapDefinition, MapPoi, MapPoiBundle, PlayerFix, PoiCategory, SquadPosition } from "../types";

interface MapViewProps {
  definition: MapDefinition;
  activeFloor: string;
  fix: PlayerFix | null;
  squadPositions?: SquadPosition[];
  follow: boolean;
  poiBundle: MapPoiBundle | null;
  visiblePoiCategories: Set<PoiCategory>;
  selectedPoiId: string | null;
  focusPoiId: string | null;
  activeExtractIds?: Set<string>;
  onFollowChange: (follow: boolean) => void;
  onSelectPoi: (id: string | null) => void;
  onCreateWaypoint?: (position: { x: number; z: number }) => void;
  onAssetStateChange?: (state: MapAssetState) => void;
}

const noActiveExtracts = new Set<string>();

function rotate(latLng: L.LatLng, degrees: number) {
  if (!degrees) return latLng;
  const radians = degrees * Math.PI / 180;
  const rotatedX = latLng.lng * Math.cos(radians) - latLng.lat * Math.sin(radians);
  const rotatedY = latLng.lng * Math.sin(radians) + latLng.lat * Math.cos(radians);
  return L.latLng(rotatedY, rotatedX);
}

export function createMapCrs(definition: MapDefinition): L.CRS {
  const [scaleX, marginX, scaleZ, marginZ] = definition.transform;
  return L.Util.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(scaleX, marginX, -scaleZ, marginZ),
    projection: {
      project(latLng: L.LatLng) {
        const projected = rotate(latLng, definition.coordinateRotation);
        return L.point(projected.lng, projected.lat);
      },
      unproject(point: L.Point) {
        return rotate(L.latLng(point.y, point.x), definition.coordinateRotation * -1);
      },
      bounds: L.bounds([-Infinity, -Infinity], [Infinity, Infinity]),
    },
  }) as L.CRS;
}

function worldPoint(position: { x: number; z: number }) {
  return L.latLng(position.z, position.x);
}

function mapBounds(definition: MapDefinition, useSvgBounds = false) {
  const bounds = useSvgBounds && definition.svgBounds ? definition.svgBounds : definition.bounds;
  return L.latLngBounds([bounds[0][1], bounds[0][0]], [bounds[1][1], bounds[1][0]]);
}

function markerIcon(angle: number, stale: boolean) {
  return L.divIcon({
    className: "player-marker-shell",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div class="player-marker${stale ? " stale" : ""}"><span class="player-arrow" style="transform: rotate(${angle}deg)"></span><span class="player-dot"></span></div>`,
  });
}

function squadColor(senderId: string) {
  const palette = ["#61c7b5", "#d8a45d", "#7fa9e8", "#d67883", "#a891db", "#86bd68", "#d58ccc"];
  let hash = 0;
  for (const character of senderId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function squadMarkerIcon(position: SquadPosition, angle: number, stale: boolean) {
  const color = squadColor(position.senderId);
  return L.divIcon({
    className: "squad-marker-shell",
    iconSize: [120, 44],
    iconAnchor: [22, 22],
    html: `<div class="squad-marker${stale ? " stale" : ""}" style="--squad-color:${color}"><span class="squad-arrow" style="transform:rotate(${angle}deg)"></span><span class="squad-dot"></span><b>${escapeHtml(position.nickname)}</b></div>`,
  });
}

function assetForFloor(definition: MapDefinition, activeFloor: string): MapAsset {
  return definition.floors.find((floor) => floor.id === activeFloor)?.asset ?? definition.baseAsset;
}

function configureSvgLayers(svg: SVGSVGElement, definition: MapDefinition, activeFloor: string) {
  const source = svg.firstElementChild instanceof SVGSVGElement ? svg.firstElementChild : svg;
  const viewBox = source.getAttribute("viewBox");
  if (viewBox) svg.setAttribute("viewBox", viewBox);
  const visible = new Set([definition.baseAsset.type === "svg" ? definition.baseAsset.baseLayer : null, activeFloor]);
  for (const child of Array.from(source.children)) {
    if (!(child instanceof SVGGElement) || !child.id) continue;
    const keepWith = child.dataset.keepWithGroup;
    child.style.display = visible.has(child.id) || (keepWith ? visible.has(keepWith) : false) ? "" : "none";
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;",
  })[character]!);
}

function glyphMarkup(category: PoiCategory) {
  let paths: string;
  if (category.startsWith("extract-")) {
    paths = '<path d="M5 5h8v3M5 19h8v-3M11 12h10M17 8l4 4-4 4M5 5v14"/>';
  } else if (category === "transit") {
    paths = '<path d="M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4"/>';
  } else if (category === "switch") {
    paths = '<path d="m13 2-7 11h6l-1 9 7-12h-6l1-8Z"/>';
  } else if (category === "hazard") {
    paths = '<path d="m12 3 10 18H2L12 3ZM12 9v5M12 17h.01"/>';
  } else if (category === "btr") {
    paths = '<path d="M3 8h13l4 4v5H3V8ZM16 8l-2-3H8L6 8"/><circle cx="7" cy="18" r="2"/><circle cx="16" cy="18" r="2"/>';
  } else if (category === "boss-zone") {
    paths = '<path d="M7 9V5l3 2 2-4 2 4 3-2v4M6 10h12v9H6zM9 14h.01M15 14h.01M10 18h4"/>';
  } else if (category === "locked-door") {
    paths = '<rect x="5" y="10" width="14" height="11" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>';
  } else if (category === "quest-objective") {
    paths = '<path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2"/>';
  } else if (category === "custom-pin") {
    paths = '<path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z"/><path d="M9 9h6M12 6v6"/>';
  } else if (category.startsWith("spawn-")) {
    paths = '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>';
  } else if (category === "loot") {
    paths = '<path d="M3 8h18v12H3V8ZM7 8V4h10v4M9 13h6"/>';
  } else {
    paths = '<path d="M4 15h12l4 3H8l-4-3ZM7 15l3-8h7l3 3"/><circle cx="14" cy="7" r="2"/>';
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function poiIcon(poi: MapPoi, selected: boolean, active = false) {
  const label = poi.kind === "extract" || poi.kind === "transit"
    ? `<span class="poi-marker-label">${escapeHtml(poi.name)}</span>`
    : "";
  return L.divIcon({
    className: "poi-marker-shell",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div class="poi-marker ${poi.category}${selected ? " selected" : ""}${active ? " raid-active" : ""}"><span class="poi-marker-glyph">${glyphMarkup(poi.category)}</span>${label}</div>`,
  });
}

function popupContent(poi: MapPoi, index: Map<string, MapPoi>, onFocus: (id: string) => void) {
  const content = document.createElement("div");
  content.className = "poi-popup-content";
  const kicker = document.createElement("span");
  kicker.className = "poi-popup-kicker";
  kicker.textContent = poi.category.replaceAll("-", " ");
  const title = document.createElement("strong");
  title.textContent = poi.name;
  const elevation = document.createElement("small");
  elevation.textContent = `Elevation ${poi.position.y.toFixed(1)} m`;
  content.append(kicker, title, elevation);
  if (poi.kind === "extract" && poi.transferItem) {
    const requirement = document.createElement("small");
    requirement.textContent = `Payment required: ${poi.transferItem.count.toLocaleString()} units`;
    content.append(requirement);
  }
  if (poi.kind === "boss-zone") {
    const chance = document.createElement("small");
    chance.textContent = `Raid chance ${Math.round(poi.spawnChance * 100)}% · zone weight ${Math.round(poi.zoneChance * 100)}%`;
    content.append(chance);
  }
  if (poi.kind === "locked-door" && poi.keyIds.length) {
    const key = document.createElement("small");
    key.textContent = `Required key ID: ${poi.keyIds.join(", ")}`;
    content.append(key);
  }

  const links = poi.kind === "extract"
    ? poi.switchIds.map((id) => index.get(id)).filter((value): value is MapPoi => Boolean(value))
    : poi.kind === "switch"
      ? poi.activates.map((operation) => index.get(operation.targetId)).filter((value): value is MapPoi => Boolean(value))
      : [];
  for (const linked of links) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = poi.kind === "extract" ? `Activation: ${linked.name}` : `Controls: ${linked.name}`;
    button.addEventListener("click", () => onFocus(linked.id));
    content.append(button);
  }
  return content;
}

function outlineForPoi(poi: MapPoi) {
  if (!poi.outline?.length) return null;
  return L.polygon(poi.outline.map(worldPoint), {
    className: `poi-outline ${poi.category}`,
    color: "currentColor",
    weight: 1,
    opacity: 0,
    fillOpacity: 0,
    interactive: false,
  });
}

function isDenseCategory(category: PoiCategory) {
  return category === "loot" || category.startsWith("spawn-");
}

export function MapView({
  definition,
  activeFloor,
  fix,
  squadPositions = [],
  follow,
  poiBundle,
  visiblePoiCategories,
  selectedPoiId,
  focusPoiId,
  activeExtractIds = noActiveExtracts,
  onFollowChange,
  onSelectPoi,
  onCreateWaypoint,
  onAssetStateChange,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.Layer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const squadMarkersRef = useRef(new Map<string, L.Marker>());
  const poiMarkersRef = useRef(new Map<string, L.Marker>());
  const poiParentsRef = useRef(new Map<string, L.MarkerClusterGroup>());
  const poiOutlinesRef = useRef(new Map<string, L.Polygon>());
  const selectedPoiRef = useRef<string | null>(selectedPoiId);
  const previousSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, {
      crs: createMapCrs(definition),
      attributionControl: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      minZoom: definition.minZoom,
      maxZoom: definition.maxZoom,
      maxBoundsViscosity: 0.85,
      zoomControl: false,
      doubleClickZoom: false,
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    map.setMaxBounds(mapBounds(definition).pad(0.5));
    map.fitBounds(mapBounds(definition), { animate: false, padding: [30, 30] });
    const updateDetail = () => {
      if (containerRef.current) containerRef.current.dataset.detail = String(map.getZoom() >= definition.minZoom + 1.25);
    };
    updateDetail();
    map.on("zoomend", updateDetail);
    map.on("click", () => onSelectPoi(null));
    map.on("dblclick", (event: L.LeafletMouseEvent) => onCreateWaypoint?.({ x: event.latlng.lng, z: event.latlng.lat }));
    map.on("dragstart", () => onFollowChange(false));
    map.on("zoomstart", (event) => {
      if ((event as unknown as { originalEvent?: Event }).originalEvent) onFollowChange(false);
    });
    mapRef.current = map;
    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      baseLayerRef.current = null;
      markerRef.current = null;
      squadMarkersRef.current.clear();
      poiMarkersRef.current.clear();
      poiParentsRef.current.clear();
      poiOutlinesRef.current.clear();
    };
  }, [definition, onCreateWaypoint, onFollowChange, onSelectPoi]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    if (baseLayerRef.current) {
      baseLayerRef.current.removeFrom(map);
      baseLayerRef.current = null;
    }
    const asset = assetForFloor(definition, activeFloor);
    const assetName = asset.type === "tiles" ? asset.template : asset.path;
    onAssetStateChange?.({ status: "loading", asset: assetName, message: null });
    if (asset.type === "tiles") {
      const layer = L.tileLayer(asset.template, {
        tileSize: asset.tileSize,
        minNativeZoom: asset.nativeZoom,
        maxNativeZoom: asset.nativeZoom,
        minZoom: definition.minZoom,
        maxZoom: definition.maxZoom,
        bounds: mapBounds(definition),
        noWrap: true,
        className: "tarkov-raster-layer",
      });
      const onLoad = () => onAssetStateChange?.({ status: "ready", asset: assetName, message: null });
      const onError = () => onAssetStateChange?.({ status: "error", asset: assetName, message: `Unable to load ${assetName}` });
      layer.once("load", onLoad);
      layer.once("tileerror", onError);
      layer.addTo(map);
      baseLayerRef.current = layer;
      return () => {
        layer.off("load", onLoad);
        layer.off("tileerror", onError);
        layer.removeFrom(map);
      };
    }

    if (asset.type === "image") {
      const bounds = L.latLngBounds([asset.bounds[0][1], asset.bounds[0][0]], [asset.bounds[1][1], asset.bounds[1][0]]);
      const layer = L.imageOverlay(asset.path, bounds, { className: "tarkov-raster-layer" });
      layer.once("load", () => onAssetStateChange?.({ status: "ready", asset: assetName, message: null }));
      layer.once("error", () => onAssetStateChange?.({ status: "error", asset: assetName, message: `Unable to load ${assetName}` }));
      layer.addTo(map).bringToBack();
      baseLayerRef.current = layer;
      return () => layer.removeFrom(map);
    }

    void fetch(asset.path)
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load ${asset.path}`);
        return response.text();
      })
      .then((source) => {
        if (cancelled) return;
        const parsed = new DOMParser().parseFromString(source, "image/svg+xml").documentElement;
        if (parsed.localName !== "svg") throw new Error("Map asset is not an SVG");
        const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        wrapper.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        wrapper.append(parsed);
        configureSvgLayers(wrapper, definition, activeFloor);
        const layer = L.svgOverlay(wrapper, mapBounds(definition, true), { className: "tarkov-svg-layer" }).addTo(map);
        baseLayerRef.current = layer;
        layer.bringToBack();
        onAssetStateChange?.({ status: "ready", asset: assetName, message: null });
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) onAssetStateChange?.({ status: "error", asset: assetName, message: String(error) });
      });
    return () => {
      cancelled = true;
      if (baseLayerRef.current) {
        baseLayerRef.current.removeFrom(map);
        baseLayerRef.current = null;
      }
    };
  }, [activeFloor, definition, onAssetStateChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !poiBundle) return;
    const allPois = new Map(poiBundle.pois.map((poi) => [poi.id, poi]));
    const groups: L.Layer[] = [];
    const markers = new Map<string, L.Marker>();
    const parents = new Map<string, L.MarkerClusterGroup>();
    const outlines = new Map<string, L.Polygon>();
    for (const category of visiblePoiCategories) {
      const group = isDenseCategory(category)
        ? L.markerClusterGroup({
          showCoverageOnHover: false,
          maxClusterRadius: 42,
          disableClusteringAtZoom: Math.max(definition.minZoom + 3, definition.maxZoom - 1),
          iconCreateFunction: (cluster) => L.divIcon({
            className: "poi-cluster-shell",
            html: `<div class="poi-cluster ${category}">${cluster.getChildCount()}</div>`,
            iconSize: [34, 34],
          }),
        })
        : L.layerGroup();
      for (const poi of poiBundle.pois) {
        if (poi.category !== category || !poiMatchesFloor(poi, definition, activeFloor)) continue;
        const outline = outlineForPoi(poi);
        if (outline) outline.addTo(group);
        const marker = L.marker(worldPoint(poi.position), {
          icon: poiIcon(poi, selectedPoiRef.current === poi.id, activeExtractIds.has(poi.id)),
          title: poi.name,
          riseOnHover: true,
          zIndexOffset: poi.kind === "extract" ? 300 : poi.kind === "transit" ? 250 : 100,
        });
        marker.bindTooltip(poi.name, { direction: "top", offset: [0, -12], className: "poi-tooltip" });
        marker.bindPopup(popupContent(poi, allPois, onSelectPoi), { className: "poi-popup", offset: [0, -8], closeButton: false });
        marker.on("mouseover", () => outline?.setStyle({ opacity: 0.9, fillOpacity: 0.1 }));
        marker.on("mouseout", () => {
          if (selectedPoiRef.current !== poi.id) outline?.setStyle({ opacity: 0, fillOpacity: 0 });
        });
        marker.on("click", () => {
          onSelectPoi(poi.id);
          outline?.setStyle({ opacity: 1, fillOpacity: 0.12 });
        });
        marker.addTo(group);
        markers.set(poi.id, marker);
        if (outline) outlines.set(poi.id, outline);
        if (group instanceof L.MarkerClusterGroup) parents.set(poi.id, group);
      }
      group.addTo(map);
      groups.push(group);
    }
    poiMarkersRef.current = markers;
    poiParentsRef.current = parents;
    poiOutlinesRef.current = outlines;
    return () => {
      groups.forEach((group) => group.removeFrom(map));
      poiMarkersRef.current.clear();
      poiParentsRef.current.clear();
      poiOutlinesRef.current.clear();
    };
  }, [activeExtractIds, activeFloor, definition, onSelectPoi, poiBundle, visiblePoiCategories]);

  useEffect(() => {
    selectedPoiRef.current = selectedPoiId;
    const ids = [previousSelectedRef.current, selectedPoiId].filter((id): id is string => Boolean(id));
    for (const id of ids) {
      const poi = poiBundle?.pois.find((candidate) => candidate.id === id);
      const marker = poiMarkersRef.current.get(id);
      if (poi && marker) marker.setIcon(poiIcon(poi, id === selectedPoiId, activeExtractIds.has(id)));
      const outline = poiOutlinesRef.current.get(id);
      outline?.setStyle(id === selectedPoiId ? { opacity: 1, fillOpacity: 0.12 } : { opacity: 0, fillOpacity: 0 });
    }
    previousSelectedRef.current = selectedPoiId;
  }, [activeExtractIds, poiBundle, selectedPoiId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusPoiId) return;
    const marker = poiMarkersRef.current.get(focusPoiId);
    if (!marker) return;
    const parent = poiParentsRef.current.get(focusPoiId);
    const reveal = () => {
      map.setView(marker.getLatLng(), Math.max(map.getZoom(), definition.minZoom + 2), { animate: true });
      marker.openPopup();
      onSelectPoi(focusPoiId);
    };
    if (parent) parent.zoomToShowLayer(marker, reveal);
    else reveal();
  }, [definition.minZoom, focusPoiId, onSelectPoi, visiblePoiCategories]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerRef.current?.removeFrom(map);
    markerRef.current = null;
    if (!fix || (fix.mapId && fix.mapId !== definition.id)) return;

    const update = () => {
      const location = worldPoint(fix.position);
      let angle = 0;
      if (fix.forward) {
        const from = map.latLngToLayerPoint(location);
        const to = map.latLngToLayerPoint(worldPoint({
          x: fix.position.x + fix.forward.x * 8,
          z: fix.position.z + fix.forward.z * 8,
        }));
        angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI + 90;
      }
      const stale = Date.now() - fix.observedAt >= 60_000;
      if (!markerRef.current) {
        markerRef.current = L.marker(location, { icon: markerIcon(angle, stale), zIndexOffset: 1000 }).addTo(map);
      } else {
        markerRef.current.setLatLng(location).setIcon(markerIcon(angle, stale));
      }
    };
    update();
    map.on("zoomend moveend", update);
    if (follow) map.panTo(worldPoint(fix.position), { animate: true });
    const staleTimer = window.setTimeout(update, Math.max(0, 60_000 - (Date.now() - fix.observedAt)));
    return () => {
      window.clearTimeout(staleTimer);
      map.off("zoomend moveend", update);
      markerRef.current?.removeFrom(map);
      markerRef.current = null;
    };
  }, [definition.id, fix, follow]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const visible = squadPositions.filter((position) => position.mapId === definition.id && Date.now() - position.receivedAt < 120_000);
    const visibleIds = new Set(visible.map((position) => position.senderId));
    for (const [senderId, marker] of squadMarkersRef.current) {
      if (!visibleIds.has(senderId)) {
        marker.removeFrom(map);
        squadMarkersRef.current.delete(senderId);
      }
    }
    for (const position of visible) {
      const location = worldPoint(position.position);
      const radians = (position.heading ?? 0) * Math.PI / 180;
      const from = map.latLngToLayerPoint(location);
      const to = map.latLngToLayerPoint(worldPoint({ x: position.position.x + Math.sin(radians) * 8, z: position.position.z + Math.cos(radians) * 8 }));
      const angle = position.heading === null ? 0 : Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI + 90;
      const icon = squadMarkerIcon(position, angle, Date.now() - position.receivedAt >= 60_000);
      const existing = squadMarkersRef.current.get(position.senderId);
      if (existing) existing.setLatLng(location).setIcon(icon);
      else squadMarkersRef.current.set(position.senderId, L.marker(location, { icon, zIndexOffset: 900 }).addTo(map));
    }
  }, [definition.id, squadPositions]);

  return <div className="map-canvas" ref={containerRef} aria-label={`${definition.displayName} map`} />;
}

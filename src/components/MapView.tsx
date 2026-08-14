import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import { prepareSvgMap, versionedMapAssetPath } from "../map-assets";
import { poiMatchesFloor } from "../poi";
import {
  assetForFloor,
  createMapCrs,
  isDenseCategory,
  mapBounds,
  markerIcon,
  outlineForPoi,
  poiIcon,
  popupContent,
  squadMarkerIcon,
  worldPoint,
} from "./map-view-helpers";
import type { MapAssetState, MapDefinition, MapPoiBundle, PlayerFix, PoiCategory, SquadPosition } from "../types";

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

export { createMapCrs } from "./map-view-helpers";

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
  const [squadNow, setSquadNow] = useState(() => Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.Layer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const squadMarkersRef = useRef(new Map<string, L.Marker>());

  useEffect(() => {
    if (squadPositions.length === 0) return;
    const timer = window.setInterval(() => setSquadNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, [squadPositions.length]);
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
      if (containerRef.current)
        containerRef.current.dataset.detail = String(map.getZoom() >= definition.minZoom + 1.25);
    };
    updateDetail();
    map.on("zoomend", updateDetail);
    map.on("click", () => onSelectPoi(null));
    map.on("dblclick", (event: L.LeafletMouseEvent) =>
      onCreateWaypoint?.({ x: event.latlng.lng, z: event.latlng.lat }),
    );
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
    let candidate: L.Layer | null = null;
    let committed = false;
    const asset = assetForFloor(definition, activeFloor);
    const assetName = asset.type === "tiles" ? asset.template : asset.path;
    onAssetStateChange?.({ status: "loading", asset: assetName, message: null });
    const commit = (layer: L.Layer, message: string | null = null) => {
      if (cancelled) {
        layer.removeFrom(map);
        return;
      }
      const previous = baseLayerRef.current;
      baseLayerRef.current = layer;
      committed = true;
      if (previous && previous !== layer) previous.removeFrom(map);
      if ("bringToBack" in layer && typeof layer.bringToBack === "function") layer.bringToBack();
      onAssetStateChange?.({ status: "ready", asset: assetName, message });
    };
    const fail = (error: unknown) => {
      console.error(error);
      if (candidate) candidate.removeFrom(map);
      candidate = null;
      if (!cancelled) onAssetStateChange?.({ status: "error", asset: assetName, message: String(error) });
    };
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
      candidate = layer;
      const onLoad = () => commit(layer);
      const onError = () => fail(new Error(`Unable to load ${assetName}`));
      layer.once("load", onLoad);
      layer.once("tileerror", onError);
      layer.addTo(map);
      return () => {
        cancelled = true;
        layer.off("load", onLoad);
        layer.off("tileerror", onError);
        if (!committed) layer.removeFrom(map);
      };
    }

    if (asset.type === "image") {
      void versionedMapAssetPath(asset.path)
        .then((path) => {
          if (cancelled) return;
          const bounds = L.latLngBounds(
            [asset.bounds[0][1], asset.bounds[0][0]],
            [asset.bounds[1][1], asset.bounds[1][0]],
          );
          const layer = L.imageOverlay(path, bounds, { className: "tarkov-raster-layer" });
          candidate = layer;
          layer.once("load", () =>
            commit(
              layer,
              asset.calibrationStatus === "needs-local-verification"
                ? "Community artwork loaded; verify live coordinate alignment locally before publishing the Windows installer."
                : null,
            ),
          );
          layer.once("error", () => fail(new Error(`Unable to load ${assetName}`)));
          layer.addTo(map);
        })
        .catch(fail);
      return () => {
        cancelled = true;
        if (candidate && !committed) candidate.removeFrom(map);
      };
    }

    void versionedMapAssetPath(asset.path)
      .then((path) => fetch(path, { cache: "no-store" }))
      .then((response) => {
        if (!response.ok) throw new Error(`Unable to load ${asset.path}`);
        return response.text();
      })
      .then((source) => {
        if (cancelled) return;
        const svg = prepareSvgMap(source, definition, activeFloor);
        const layer = L.svgOverlay(svg, mapBounds(definition, true), { className: "tarkov-svg-layer" }).addTo(map);
        candidate = layer;
        commit(layer);
      })
      .catch(fail);
    return () => {
      cancelled = true;
      if (candidate && !committed) candidate.removeFrom(map);
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
            iconCreateFunction: (cluster) =>
              L.divIcon({
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
        marker.bindPopup(popupContent(poi, allPois, onSelectPoi), {
          className: "poi-popup",
          offset: [0, -8],
          closeButton: false,
        });
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
        const to = map.latLngToLayerPoint(
          worldPoint({
            x: fix.position.x + fix.forward.x * 8,
            z: fix.position.z + fix.forward.z * 8,
          }),
        );
        angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + 90;
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
    const visible = squadPositions.filter(
      (position) => position.mapId === definition.id && squadNow - position.receivedAt < 120_000,
    );
    const visibleIds = new Set(visible.map((position) => position.senderId));
    for (const [senderId, marker] of squadMarkersRef.current) {
      if (!visibleIds.has(senderId)) {
        marker.removeFrom(map);
        squadMarkersRef.current.delete(senderId);
      }
    }
    for (const position of visible) {
      const location = worldPoint(position.position);
      const radians = ((position.heading ?? 0) * Math.PI) / 180;
      const from = map.latLngToLayerPoint(location);
      const to = map.latLngToLayerPoint(
        worldPoint({ x: position.position.x + Math.sin(radians) * 8, z: position.position.z + Math.cos(radians) * 8 }),
      );
      const angle = position.heading === null ? 0 : (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + 90;
      const icon = squadMarkerIcon(position, angle, squadNow - position.receivedAt >= 60_000);
      const existing = squadMarkersRef.current.get(position.senderId);
      if (existing) existing.setLatLng(location).setIcon(icon);
      else squadMarkersRef.current.set(position.senderId, L.marker(location, { icon, zIndexOffset: 900 }).addTo(map));
    }
  }, [definition.id, squadNow, squadPositions]);

  return (
    <div
      className="map-canvas"
      ref={containerRef}
      role="application"
      tabIndex={0}
      aria-label={`${definition.displayName} map`}
      aria-keyshortcuts={onCreateWaypoint ? "Enter" : undefined}
      title={onCreateWaypoint ? "Use arrow keys to pan and Enter to create a waypoint at the map center" : undefined}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || !onCreateWaypoint || !mapRef.current) return;
        event.preventDefault();
        const center = mapRef.current.getCenter();
        onCreateWaypoint({ x: center.lng, z: center.lat });
      }}
    />
  );
}

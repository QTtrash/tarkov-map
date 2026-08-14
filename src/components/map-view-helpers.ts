import L from "leaflet";
import type { MapAsset, MapDefinition, MapPoi, PoiCategory, SquadPosition } from "../types";

function rotate(latLng: L.LatLng, degrees: number) {
  if (!degrees) return latLng;
  const radians = (degrees * Math.PI) / 180;
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

export function worldPoint(position: { x: number; z: number }) {
  return L.latLng(position.z, position.x);
}

export function mapBounds(definition: MapDefinition, useSvgBounds = false) {
  const bounds = useSvgBounds && definition.svgBounds ? definition.svgBounds : definition.bounds;
  return L.latLngBounds([bounds[0][1], bounds[0][0]], [bounds[1][1], bounds[1][0]]);
}

export function markerIcon(angle: number, stale: boolean) {
  return L.divIcon({
    className: "player-marker-shell",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div class="player-marker${stale ? " stale" : ""}"><span class="player-arrow" style="transform: rotate(${angle}deg)"></span><span class="player-dot"></span></div>`,
  });
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character]!,
  );
}

function squadColor(senderId: string) {
  const palette = ["#61c7b5", "#d8a45d", "#7fa9e8", "#d67883", "#a891db", "#86bd68", "#d58ccc"];
  let hash = 0;
  for (const character of senderId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

export function squadMarkerIcon(position: SquadPosition, angle: number, stale: boolean) {
  const color = squadColor(position.senderId);
  return L.divIcon({
    className: "squad-marker-shell",
    iconSize: [120, 44],
    iconAnchor: [22, 22],
    html: `<div class="squad-marker${stale ? " stale" : ""}" style="--squad-color:${color}"><span class="squad-arrow" style="transform:rotate(${angle}deg)"></span><span class="squad-dot"></span><b>${escapeHtml(position.nickname)}</b></div>`,
  });
}

export function assetForFloor(definition: MapDefinition, activeFloor: string): MapAsset {
  return definition.floors.find((floor) => floor.id === activeFloor)?.asset ?? definition.baseAsset;
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
    paths =
      '<path d="M3 8h13l4 4v5H3V8ZM16 8l-2-3H8L6 8"/><circle cx="7" cy="18" r="2"/><circle cx="16" cy="18" r="2"/>';
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

export function poiIcon(poi: MapPoi, selected: boolean, active = false) {
  const label =
    poi.kind === "extract" || poi.kind === "transit"
      ? `<span class="poi-marker-label">${escapeHtml(poi.name)}</span>`
      : "";
  return L.divIcon({
    className: "poi-marker-shell",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div class="poi-marker ${poi.category}${selected ? " selected" : ""}${active ? " raid-active" : ""}"><span class="poi-marker-glyph">${glyphMarkup(poi.category)}</span>${label}</div>`,
  });
}

export function popupContent(poi: MapPoi, index: Map<string, MapPoi>, onFocus: (id: string) => void) {
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

  const links =
    poi.kind === "extract"
      ? poi.switchIds.map((id) => index.get(id)).filter((value): value is MapPoi => Boolean(value))
      : poi.kind === "switch"
        ? poi.activates
            .map((operation) => index.get(operation.targetId))
            .filter((value): value is MapPoi => Boolean(value))
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

export function outlineForPoi(poi: MapPoi) {
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

export function isDenseCategory(category: PoiCategory) {
  return category === "loot" || category.startsWith("spawn-");
}

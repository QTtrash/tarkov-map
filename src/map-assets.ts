import type { MapDefinition } from "./types";

let checksumPromise: Promise<Record<string, string>> | null = null;

function checksumKey(path: string) {
  return path.split("?", 1)[0].replace(/^\/maps\//, "");
}

export function pathWithAssetRevision(path: string, checksums: Record<string, string>) {
  const checksum = checksums[checksumKey(path)];
  if (!checksum) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${checksum.slice(0, 16)}`;
}

export async function versionedMapAssetPath(path: string) {
  checksumPromise ??= fetch("/maps/asset-checksums.json", { cache: "no-store" })
    .then((response) => response.ok ? response.json() as Promise<Record<string, string>> : {})
    .catch(() => ({}));
  return pathWithAssetRevision(path, await checksumPromise);
}

export function prepareSvgMap(source: string, definition: MapDefinition, activeFloor: string) {
  const documentNode = new DOMParser().parseFromString(source, "image/svg+xml");
  if (documentNode.querySelector("parsererror")) throw new Error("Map asset contains invalid SVG");
  const parsed = documentNode.documentElement;
  if (parsed.localName !== "svg") throw new Error("Map asset is not an SVG");

  const svg = document.importNode(parsed, true) as unknown as SVGSVGElement;
  const baseLayer = definition.baseAsset.type === "svg" ? definition.baseAsset.baseLayer : null;
  const floor = definition.floors.find((candidate) => candidate.id === activeFloor);
  const activeLayer = floor?.svgLayer ?? activeFloor;
  const visible = new Set([baseLayer, activeLayer].filter((value): value is string => Boolean(value)));
  const available = new Set<string>();

  for (const child of Array.from(svg.children)) {
    if (child.localName !== "g" || !child.id) continue;
    available.add(child.id);
    const keepWith = child.getAttribute("data-keep-with-group");
    child.setAttribute("style", visible.has(child.id) || (keepWith ? visible.has(keepWith) : false) ? "" : "display: none;");
  }

  if (baseLayer && !available.has(baseLayer)) {
    throw new Error(`Map asset is missing base layer ${baseLayer}`);
  }
  if (activeLayer !== baseLayer && !available.has(activeLayer)) {
    throw new Error(`Map asset is missing floor layer ${activeLayer}`);
  }
  return svg;
}

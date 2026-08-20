import type { FloorDefinition, LootGroupId, MapDefinition, MapPoi, MapPoiBundle, PoiCategory, Vec3 } from "./types";
import { parsePoiBundle } from "./validation";

export const defaultVisiblePoiCategories: PoiCategory[] = [
  "extract-pmc",
  "extract-scav",
  "extract-shared",
  "transit",
  "switch",
  "btr",
  "boss-zone",
];

export const lootGroupDefinitions: Array<{ id: LootGroupId; name: string; shortName: string }> = [
  { id: "drawers", name: "Drawers", shortName: "DRW" },
  { id: "bags", name: "Bags, jackets, cases", shortName: "BAG" },
  { id: "weapon-ammo", name: "Weapon and ammo", shortName: "WPN" },
  { id: "medical", name: "Medical", shortName: "MED" },
  { id: "technical", name: "Tools and technical", shortName: "TEC" },
  { id: "supply-crates", name: "Supply crates", shortName: "CRT" },
  { id: "safes-cash", name: "Safes and cash", shortName: "VAL" },
  { id: "caches", name: "Hidden caches", shortName: "CCH" },
  { id: "bodies", name: "Bodies", shortName: "BDY" },
  { id: "other", name: "Other containers", shortName: "OTH" },
];

export const allLootGroupIds = lootGroupDefinitions.map(({ id }) => id);

const lootGroupsByType: Record<string, LootGroupId> = {
  drawer: "drawers",
  "duffle-bag": "bags",
  jacket: "bags",
  "plastic-suitcase": "bags",
  "weapon-box": "weapon-ammo",
  "wooden-ammo-box": "weapon-ammo",
  "grenade-box": "weapon-ammo",
  "medbag-smu06": "medical",
  medcase: "medical",
  "medical-supply-crate": "medical",
  toolbox: "technical",
  "pc-block": "technical",
  "technical-supply-crate": "technical",
  "wooden-crate": "supply-crates",
  "ration-supply-crate": "supply-crates",
  safe: "safes-cash",
  "bank-safe": "safes-cash",
  "cash-register": "safes-cash",
  "bank-cash-register": "safes-cash",
  "buried-barrel-cache": "caches",
  "ground-cache": "caches",
  "shturmans-stash": "caches",
  "dead-scav": "bodies",
  "pmc-body": "bodies",
  "civilian-body": "bodies",
  "scav-body": "bodies",
  "lab-technician-body": "bodies",
};

export function lootGroupForType(lootType: string): LootGroupId {
  return lootGroupsByType[lootType] ?? "other";
}

export function countLootGroups(pois: MapPoi[]) {
  const counts = new Map<LootGroupId, number>();
  for (const poi of pois) {
    if (poi.kind !== "loot") continue;
    const group = lootGroupForType(poi.lootType);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return counts;
}

export const poiCategoryGroups: Array<{
  id: string;
  name: string;
  categories: Array<{ id: PoiCategory; name: string; shortName: string }>;
}> = [
  {
    id: "extracts",
    name: "Extraction",
    categories: [
      { id: "extract-pmc", name: "PMC extracts", shortName: "PMC" },
      { id: "extract-scav", name: "Scav extracts", shortName: "SCV" },
      { id: "extract-shared", name: "Shared extracts", shortName: "ALL" },
      { id: "transit", name: "Transits", shortName: "TRN" },
    ],
  },
  {
    id: "utility",
    name: "Utility",
    categories: [
      { id: "switch", name: "Switches", shortName: "PWR" },
      { id: "btr", name: "BTR stops", shortName: "BTR" },
      { id: "stationary-weapon", name: "Stationary weapons", shortName: "WPN" },
    ],
  },
  {
    id: "danger",
    name: "Danger",
    categories: [
      { id: "hazard", name: "Hazards", shortName: "HZD" },
      { id: "boss-zone", name: "Boss zones", shortName: "BOS" },
    ],
  },
  {
    id: "access",
    name: "Access",
    categories: [{ id: "locked-door", name: "Locked access", shortName: "KEY" }],
  },
  {
    id: "spawns",
    name: "Spawns",
    categories: [
      { id: "spawn-pmc", name: "PMC spawns", shortName: "PMC" },
      { id: "spawn-scav", name: "Scav spawns", shortName: "SCV" },
      { id: "spawn-boss", name: "Boss spawns", shortName: "BOS" },
      { id: "spawn-sniper", name: "Sniper spawns", shortName: "SNP" },
      { id: "spawn-other", name: "Other spawns", shortName: "OTH" },
    ],
  },
  {
    id: "loot",
    name: "Resources",
    categories: [{ id: "loot", name: "Loot containers", shortName: "LUT" }],
  },
];

export async function loadPoiBundle(path: string, signal?: AbortSignal): Promise<MapPoiBundle> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`Unable to load map intelligence (${response.status})`);
  return parsePoiBundle(await response.json());
}

export function horizontalDistance(first: Vec3, second: Vec3) {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

export function nearestExtracts(pois: MapPoi[], position: Vec3, limit = 3, activeIds?: Set<string>) {
  return pois
    .filter((poi) => poi.kind === "extract" && (!activeIds || activeIds.has(poi.id)))
    .map((poi) => ({ poi, distance: horizontalDistance(position, poi.position) }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit);
}

function positionInBounds(position: Vec3, bounds: NonNullable<FloorDefinition["extents"][number]["bounds"]>[number]) {
  const [first, second] = bounds;
  return (
    position.x >= Math.min(first[0], second[0]) &&
    position.x <= Math.max(first[0], second[0]) &&
    position.z >= Math.min(first[1], second[1]) &&
    position.z <= Math.max(first[1], second[1])
  );
}

function extentRelation(poi: MapPoi, floor: FloorDefinition): "full" | "partial" | null {
  const top = poi.top ?? poi.position.y;
  const bottom = poi.bottom ?? poi.position.y;
  for (const extent of floor.extents) {
    const minimum = Math.min(...extent.height);
    const maximum = Math.max(...extent.height);
    if (top < minimum || bottom >= maximum) continue;
    if (extent.bounds?.length && !extent.bounds.some((bounds) => positionInBounds(poi.position, bounds))) continue;
    return bottom >= minimum && top <= maximum ? "full" : "partial";
  }
  return null;
}

export function poiMatchesFloor(poi: MapPoi, map: MapDefinition, activeFloor: string) {
  if (activeFloor !== map.baseFloor.id) {
    const floor = map.floors.find((candidate) => candidate.id === activeFloor);
    return floor ? extentRelation(poi, floor) !== null : true;
  }
  return !map.floors.some(
    (floor) => floor.extents.some((extent) => Boolean(extent.bounds?.length)) && extentRelation(poi, floor) === "full",
  );
}

export function searchPois(pois: MapPoi[], query: string, limit = 8) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return pois
    .filter((poi) =>
      [poi.name, ...(poi.aliases ?? []), poi.category].some((value) => value.toLocaleLowerCase().includes(normalized)),
    )
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, limit);
}

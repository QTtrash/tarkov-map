import type { FloorDefinition, MapDefinition, Vec3 } from "./types";

function inBounds(position: Vec3, bounds: NonNullable<FloorDefinition["extents"][number]["bounds"]>[number]) {
  const [first, second] = bounds;
  const minX = Math.min(first[0], second[0]);
  const maxX = Math.max(first[0], second[0]);
  const minZ = Math.min(first[1], second[1]);
  const maxZ = Math.max(first[1], second[1]);
  return position.x >= minX && position.x <= maxX && position.z >= minZ && position.z <= maxZ;
}

function floorScore(floor: FloorDefinition, position: Vec3): number | null {
  let best: number | null = null;
  for (const extent of floor.extents) {
    const [minimum, maximum] = extent.height;
    if (position.y < Math.min(minimum, maximum) || position.y > Math.max(minimum, maximum)) continue;
    if (extent.bounds?.length && !extent.bounds.some((bounds) => inBounds(position, bounds))) continue;
    const heightSpan = Math.abs(maximum - minimum);
    const score = (extent.bounds?.length ? 10_000 : 0) - heightSpan;
    best = best === null ? score : Math.max(best, score);
  }
  return best;
}

export function chooseAutomaticFloor(map: MapDefinition, position: Vec3): string {
  const matches = map.floors
    .map((floor) => ({ floor, score: floorScore(floor, position) }))
    .filter((candidate): candidate is { floor: FloorDefinition; score: number } => candidate.score !== null)
    .sort((left, right) => right.score - left.score);
  return matches[0]?.floor.id ?? map.baseFloor.id;
}

export function getActiveFloor(
  map: MapDefinition,
  position: Vec3 | null,
  floorMode: string,
): string {
  if (floorMode !== "auto") return floorMode;
  return position ? chooseAutomaticFloor(map, position) : map.baseFloor.id;
}

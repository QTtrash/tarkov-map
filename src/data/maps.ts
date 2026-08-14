import generatedMaps from "./maps.generated.json";
import type { MapDefinition } from "../types";
import { parseMapDefinitions } from "../validation";

export const maps: MapDefinition[] = parseMapDefinitions(generatedMaps);

export function getMapDefinition(mapId: string | null | undefined): MapDefinition | undefined {
  return maps.find((map) => map.id === mapId);
}

import generatedMaps from "./maps.generated.json";
import type { MapDefinition } from "../types";

export const maps = generatedMaps as MapDefinition[];

export function getMapDefinition(mapId: string | null | undefined): MapDefinition | undefined {
  return maps.find((map) => map.id === mapId);
}

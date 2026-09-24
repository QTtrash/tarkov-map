import { pinsForMap } from "./map-overlays";
import type { CustomPinPoi } from "./types";
import { parseCustomPins } from "./validation";

export const companionPinsKey = "raid-signal-companion-pins";
export const maxCompanionPins = 500;

export function removeCompanionWaypoints(pins: CustomPinPoi[], mapId: string, id?: string) {
  const removed = new Set(
    pinsForMap(pins, mapId)
      .filter((pin) => id === undefined || pin.id === id)
      .map((pin) => pin.id),
  );
  return { pins: pins.filter((pin) => !removed.has(pin.id)), removed };
}

export function persistCompanionWaypoints(pins: CustomPinPoi[]): boolean {
  try {
    localStorage.setItem(companionPinsKey, JSON.stringify(parseCustomPins(pins)));
    return true;
  } catch {
    return false;
  }
}

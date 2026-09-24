import { afterEach, describe, expect, it, vi } from "vitest";
import { companionPinsKey, persistCompanionWaypoints, removeCompanionWaypoints } from "./companion-waypoints";
import type { CustomPinPoi } from "./types";

const pin = (id: string): CustomPinPoi => ({
  id,
  kind: "custom-pin",
  category: "custom-pin",
  name: "Waypoint",
  note: "",
  position: { x: 1, y: 0, z: 2 },
});
afterEach(() => vi.restoreAllMocks());

describe("companion waypoint removal", () => {
  const pins = [pin("pin-customs-a"), pin("pin-customs-b"), pin("pin-woods-a")];
  it("deletes only the requested saved pin on the current map", () => {
    expect(removeCompanionWaypoints(pins, "customs", "pin-customs-a").pins.map((p) => p.id)).toEqual([
      "pin-customs-b",
      "pin-woods-a",
    ]);
    expect(removeCompanionWaypoints(pins, "customs", "pin-woods-a").pins).toEqual(pins);
    expect(removeCompanionWaypoints(pins, "customs", "quest-objective").removed.size).toBe(0);
  });
  it("clears one map, supplies IDs for stale selection cleanup, and persists after reading storage again", () => {
    const result = removeCompanionWaypoints(pins, "customs");
    expect(result.removed).toEqual(new Set(["pin-customs-a", "pin-customs-b"]));
    expect(persistCompanionWaypoints(result.pins)).toBe(true);
    expect(JSON.parse(localStorage.getItem(companionPinsKey)!)).toEqual([pins[2]]);
    expect(pins).toHaveLength(3);
  });
  it("reports unavailable storage and rejects invalid or oversized writes without replacing saved data", () => {
    localStorage.setItem(companionPinsKey, "previous");
    expect(persistCompanionWaypoints(Array.from({ length: 501 }, (_, i) => pin(`pin-customs-${i}`)))).toBe(false);
    expect(persistCompanionWaypoints([{ ...pins[0], position: { x: Infinity, y: 0, z: 0 } }])).toBe(false);
    expect(localStorage.getItem(companionPinsKey)).toBe("previous");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    expect(persistCompanionWaypoints(pins)).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "./locator";
import { parseCustomPins, parseQuestProgress, parseSettings, parseSquadPositions, readStoredJson } from "./validation";

describe("runtime boundary validation", () => {
  it("accepts current settings and rejects unsupported or unsafe values", () => {
    expect(parseSettings(defaultSettings)).toEqual(defaultSettings);
    const olderSettings: Record<string, unknown> = { ...defaultSettings };
    delete olderSettings.visibleLootGroups;
    expect(parseSettings(olderSettings)).toEqual(defaultSettings);
    expect(() => parseSettings({ ...defaultSettings, schemaVersion: 99 })).toThrow();
    expect(() => parseSettings({ ...defaultSettings, overlayOpacity: Number.NaN })).toThrow();
    expect(() => parseSettings({ ...defaultSettings, selectedMap: "../escape" })).toThrow();
    expect(() => parseSettings({ ...defaultSettings, visibleLootGroups: ["constructor"] })).toThrow();
  });

  it("rejects malformed persisted pins and progress", () => {
    expect(() =>
      parseCustomPins([
        {
          id: "pin",
          kind: "custom-pin",
          category: "custom-pin",
          name: "Pin",
          note: "",
          position: { x: 0, y: 0, z: Number.POSITIVE_INFINITY },
        },
      ]),
    ).toThrow();
    expect(() => parseQuestProgress([{ taskId: "task", status: "invented", updatedAt: 1 }])).toThrow();
  });

  it("accepts squad positions relayed to the overlay and rejects malformed ones", () => {
    const position = {
      senderId: "11111111-1111-1111-1111-111111111111",
      sequence: 1,
      nickname: "PLAYER",
      mapId: "customs",
      position: { x: 1, y: 2, z: 3 },
      heading: 90,
      observedAt: 1,
      receivedAt: 2,
    };
    expect(parseSquadPositions([position])).toEqual([position]);
    expect(parseSquadPositions([{ ...position, heading: null }])).toEqual([{ ...position, heading: null }]);
    expect(() => parseSquadPositions([{ ...position, senderId: "not-a-sender" }])).toThrow();
    expect(() => parseSquadPositions([{ ...position, sequence: 0 }])).toThrow();
    expect(() => parseSquadPositions([{ ...position, nickname: "" }])).toThrow();
    expect(() => parseSquadPositions([{ ...position, mapId: "../escape" }])).toThrow();
    expect(() => parseSquadPositions([{ ...position, heading: 360 }])).toThrow();
    expect(() => parseSquadPositions(Array.from({ length: 17 }, () => position))).toThrow();
  });

  it("falls back without rewriting corrupt local storage", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockReturnValue("{broken");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    expect(readStoredJson("pins", parseCustomPins, [])).toEqual([]);
    expect(getItem).toHaveBeenCalledWith("pins");
    expect(setItem).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "./locator";
import {
  parseCustomPins,
  parseQuestPoiSnapshot,
  parseQuestProgress,
  parseSettings,
  readStoredJson,
} from "./validation";

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

  it("accepts quest objective snapshots relayed to the overlay and rejects malformed ones", () => {
    const poi = {
      id: "quest-active-task-objective-customs-0",
      kind: "quest-objective",
      category: "quest-objective",
      mapId: "customs",
      name: "Debut",
      description: "Eliminate Scavs",
      taskId: "task",
      objectiveId: "objective",
      position: { x: 10, y: 0, z: 20 },
    };
    const snapshot = { mapId: "customs", pois: [poi] };
    expect(parseQuestPoiSnapshot(snapshot)).toEqual(snapshot);
    expect(parseQuestPoiSnapshot({ mapId: "customs", pois: [] })).toEqual({ mapId: "customs", pois: [] });
    expect(() => parseQuestPoiSnapshot({ ...snapshot, mapId: "../escape" })).toThrow();
    expect(() => parseQuestPoiSnapshot({ mapId: "customs", pois: [{ ...poi, taskId: "" }] })).toThrow();
    expect(() => parseQuestPoiSnapshot({ mapId: "customs", pois: [{ ...poi, kind: "extract" }] })).toThrow();
    expect(() => parseQuestPoiSnapshot({ mapId: "customs", pois: Array.from({ length: 129 }, () => poi) })).toThrow();
  });

  it("falls back without rewriting corrupt local storage", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockReturnValue("{broken");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    expect(readStoredJson("pins", parseCustomPins, [])).toEqual([]);
    expect(getItem).toHaveBeenCalledWith("pins");
    expect(setItem).not.toHaveBeenCalled();
  });
});

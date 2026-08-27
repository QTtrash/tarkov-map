import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "./locator";
import { parseCustomPins, parseQuestBundle, parseQuestProgress, parseSettings, readStoredJson } from "./validation";

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

  it("parses quest bundles generated before possible locations existed", () => {
    const objective = {
      id: "objective",
      description: "Locate the magazine",
      type: "findQuestItem",
      optional: false,
      mapIds: ["interchange"],
      details: [],
      zones: [],
    };
    const bundle = (objectives: unknown[]) => ({
      schemaVersion: 2,
      generatedAt: "2026-01-01",
      gameMode: "pve",
      quests: [
        {
          id: "quest",
          name: "Minute of Fame",
          traderId: "skier",
          traderName: "Skier",
          minPlayerLevel: 12,
          primaryMapId: "interchange",
          mapIds: ["interchange"],
          summary: "",
          experience: 0,
          chainDepth: 0,
          rewardSummary: [],
          objectives,
          requirements: [],
        },
      ],
    });
    expect(parseQuestBundle(bundle([objective])).quests[0].objectives[0].possibleLocations).toEqual([]);
    const located = { ...objective, possibleLocations: [{ mapId: "interchange", positions: [{ x: 1, y: 2, z: 3 }] }] };
    expect(parseQuestBundle(bundle([located])).quests[0].objectives[0].possibleLocations).toEqual(
      located.possibleLocations,
    );
    expect(() =>
      parseQuestBundle(bundle([{ ...objective, possibleLocations: [{ mapId: "../escape", positions: [] }] }])),
    ).toThrow();
  });

  it("falls back without rewriting corrupt local storage", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockReturnValue("{broken");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    expect(readStoredJson("pins", parseCustomPins, [])).toEqual([]);
    expect(getItem).toHaveBeenCalledWith("pins");
    expect(setItem).not.toHaveBeenCalled();
  });
});

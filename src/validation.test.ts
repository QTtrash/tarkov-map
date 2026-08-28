import { describe, expect, it, vi } from "vitest";
import { defaultSettings } from "./locator";
import {
  parseCustomPins,
  parseQuestBundle,
  parseQuestPoiSnapshot,
  parseQuestProgress,
  parseSettings,
  parseSquadPositions,
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
    expect(() => parseSquadPositions([{ ...position, sequence: Number.MAX_SAFE_INTEGER + 1 }])).toThrow();
    expect(() => parseSquadPositions([{ ...position, observedAt: -1 }])).toThrow();
    expect(() => parseSquadPositions(Array.from({ length: 17 }, () => position))).toThrow();
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
    const possibleLocation = {
      ...poi,
      id: "quest-active-task-objective-customs-possible-0",
      kind: "quest-possible-location",
      locationIndex: 0,
      locationCount: 2,
    };
    expect(parseQuestPoiSnapshot({ mapId: "customs", pois: [possibleLocation] })).toEqual({
      mapId: "customs",
      pois: [possibleLocation],
    });
    expect(() => parseQuestPoiSnapshot({ ...snapshot, mapId: "../escape" })).toThrow();
    expect(() => parseQuestPoiSnapshot({ mapId: "customs", pois: [{ ...poi, taskId: "" }] })).toThrow();
    expect(() => parseQuestPoiSnapshot({ mapId: "customs", pois: [{ ...poi, kind: "extract" }] })).toThrow();
    expect(() => parseQuestPoiSnapshot({ mapId: "woods", pois: [poi] })).toThrow();
    expect(() =>
      parseQuestPoiSnapshot({
        mapId: "customs",
        pois: [{ ...possibleLocation, locationIndex: possibleLocation.locationCount }],
      }),
    ).toThrow();
    expect(() => parseQuestPoiSnapshot({ mapId: "customs", pois: [{ ...poi, aliases: ["x".repeat(257)] }] })).toThrow();
    expect(() =>
      parseQuestPoiSnapshot({ mapId: "customs", pois: [{ ...poi, outline: Array(65).fill(poi.position) }] }),
    ).toThrow();
    expect(() => parseQuestPoiSnapshot({ mapId: "customs", pois: Array.from({ length: 129 }, () => poi) })).toThrow();
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

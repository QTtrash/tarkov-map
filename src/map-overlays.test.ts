import { describe, expect, it } from "vitest";
import { composePoiBundle, composeVisibleCategories } from "./map-overlays";
import type { MapPoiBundle, QuestObjectivePoi } from "./types";

const bundle: MapPoiBundle = {
  schemaVersion: 2,
  mapId: "customs",
  generatedAt: "2026-08-20T00:00:00.000Z",
  sources: ["test"],
  pois: [],
};

function questPoi(id: string, mapId: string): QuestObjectivePoi {
  return {
    id,
    kind: "quest-objective",
    category: "quest-objective",
    mapId,
    name: id,
    description: id,
    taskId: "task",
    objectiveId: id,
    position: { x: 10, y: 0, z: 20 },
  };
}

describe("map overlays", () => {
  it("renders active and focused quest markers only for the viewed map", () => {
    const customs = questPoi("customs-active", "customs");
    const shoreline = questPoi("shoreline-active", "shoreline");
    const focused = questPoi("customs-focused", "customs");

    const composed = composePoiBundle(bundle, "customs", [customs, shoreline], focused, [], true);

    expect(composed?.pois.map(({ id }) => id)).toEqual(["customs-active", "customs-focused"]);
    expect(composeVisibleCategories(new Set(), "customs", [shoreline], focused, [], true)).toContain("quest-objective");
    expect(composeVisibleCategories(new Set(), "woods", [customs, shoreline], focused, [], true)).not.toContain(
      "quest-objective",
    );
  });

  it("hides active and focused quest markers when the quest toggle is off", () => {
    const active = questPoi("active", "customs");
    const focused = questPoi("focused", "customs");

    expect(composePoiBundle(bundle, "customs", [active], focused, [], false)?.pois).toEqual([]);
    expect(composeVisibleCategories(new Set(), "customs", [active], focused, [], false)).not.toContain(
      "quest-objective",
    );
  });
});

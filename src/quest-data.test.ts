// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { QuestBundle } from "./types";

function loadBundle(mode: "regular" | "pve") {
  return JSON.parse(readFileSync(new URL(`../public/maps/quests/${mode}.json`, import.meta.url), "utf8")) as QuestBundle;
}

const knownMapIds = new Set((JSON.parse(readFileSync(new URL("./data/maps.generated.json", import.meta.url), "utf8")) as Array<{ id: string }>).map((map) => map.id));

describe("offline quest data", () => {
  for (const mode of ["regular", "pve"] as const) {
    it(`ships a complete schema v2 ${mode} bundle`, () => {
      const bundle = loadBundle(mode);
      expect(bundle.schemaVersion).toBe(2);
      expect(bundle.quests.length).toBeGreaterThan(400);
      expect(bundle.quests.some((quest) => quest.traderName && quest.summary && quest.rewardSummary.length)).toBe(true);
      expect(bundle.quests.some((quest) => quest.objectives.some((objective) => objective.details.length))).toBe(true);
      expect(bundle.quests.every((quest) => quest.chainDepth >= 0)).toBe(true);
      expect(bundle.quests.flatMap((quest) => quest.mapIds).every((mapId) => knownMapIds.has(mapId))).toBe(true);
    });
  }
});

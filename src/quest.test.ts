import { describe, expect, it } from "vitest";
import { buildActiveQuestObjectivePois, compareQuests, effectiveQuestStatus } from "./quest";
import type { QuestBundle, QuestDefinition, QuestProgress } from "./types";

const quest = (id: string, requirements: string[] = [], level = 1): QuestDefinition => ({
  id,
  name: id,
  traderId: "trader",
  traderName: "Prapor",
  minPlayerLevel: level,
  primaryMapId: "customs",
  mapIds: ["customs"],
  summary: "Do the thing",
  experience: 100,
  chainDepth: requirements.length,
  rewardSummary: ["100 XP"],
  objectives: [],
  requirements: requirements.map((taskId) => ({ taskId, statuses: ["Success"] })),
});

describe("quest ordering", () => {
  it("derives availability from completed prerequisites", () => {
    const progress = new Map<string, QuestProgress>([
      ["first", { taskId: "first", status: "completed", updatedAt: 1 }],
    ]);
    expect(effectiveQuestStatus(quest("second", ["first"]), progress)).toBe("available");
    expect(effectiveQuestStatus(quest("third", ["missing"]), progress)).toBe("locked");
  });

  it("puts active and available work before locked and completed work", () => {
    const quests = [quest("locked", ["missing"]), quest("available"), quest("active"), quest("done")];
    const progress = new Map<string, QuestProgress>([
      ["active", { taskId: "active", status: "active", updatedAt: 1 }],
      ["done", { taskId: "done", status: "completed", updatedAt: 1 }],
    ]);
    expect(quests.sort((a, b) => compareQuests(a, b, progress)).map(({ id }) => id)).toEqual([
      "active",
      "available",
      "locked",
      "done",
    ]);
  });

  it("collects active objective markers for the active map", () => {
    const activeQuest: QuestDefinition = {
      ...quest("active"),
      mapIds: ["customs", "shoreline"],
      objectives: [
        {
          id: "objective-1",
          description: "Inspect the checkpoint",
          type: "kill",
          optional: false,
          mapIds: ["customs"],
          details: [],
          zones: [
            {
              mapId: "customs",
              position: { x: 10, y: 0, z: 20 },
              outline: [{ x: 10, y: 0, z: 20 }],
              top: 0,
              bottom: 0,
            },
            {
              mapId: "shoreline",
              position: { x: 30, y: 0, z: 40 },
              outline: [{ x: 30, y: 0, z: 40 }],
              top: 0,
              bottom: 0,
            },
          ],
        },
      ],
    };
    const progress = new Map<string, QuestProgress>([["active", { taskId: "active", status: "active", updatedAt: 1 }]]);
    const bundle: QuestBundle = {
      schemaVersion: 2,
      generatedAt: "2026-01-01",
      gameMode: "regular",
      quests: [activeQuest],
    };

    expect(buildActiveQuestObjectivePois(bundle, "customs", progress)).toHaveLength(1);
    expect(buildActiveQuestObjectivePois(bundle, "shoreline", progress)).toHaveLength(1);
    expect(buildActiveQuestObjectivePois(bundle, "woods", progress)).toHaveLength(0);
  });
});

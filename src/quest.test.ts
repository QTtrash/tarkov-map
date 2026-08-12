import { describe, expect, it } from "vitest";
import { compareQuests, effectiveQuestStatus } from "./quest";
import type { QuestDefinition, QuestProgress } from "./types";

const quest = (id: string, requirements: string[] = [], level = 1): QuestDefinition => ({
  id, name: id, traderId: "trader", traderName: "Prapor", minPlayerLevel: level,
  primaryMapId: "customs", mapIds: ["customs"], summary: "Do the thing", experience: 100,
  chainDepth: requirements.length, rewardSummary: ["100 XP"], objectives: [],
  requirements: requirements.map((taskId) => ({ taskId, statuses: ["Success"] })),
});

describe("quest ordering", () => {
  it("derives availability from completed prerequisites", () => {
    const progress = new Map<string, QuestProgress>([["first", { taskId: "first", status: "completed", updatedAt: 1 }]]);
    expect(effectiveQuestStatus(quest("second", ["first"]), progress)).toBe("available");
    expect(effectiveQuestStatus(quest("third", ["missing"]), progress)).toBe("locked");
  });

  it("puts active and available work before locked and completed work", () => {
    const quests = [quest("locked", ["missing"]), quest("available"), quest("active"), quest("done")];
    const progress = new Map<string, QuestProgress>([
      ["active", { taskId: "active", status: "active", updatedAt: 1 }],
      ["done", { taskId: "done", status: "completed", updatedAt: 1 }],
    ]);
    expect(quests.sort((a, b) => compareQuests(a, b, progress)).map(({ id }) => id)).toEqual(["active", "available", "locked", "done"]);
  });
});

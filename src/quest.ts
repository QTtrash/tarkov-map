import type { QuestDefinition, QuestProgress, QuestStatus } from "./types";

export const questStatuses: QuestStatus[] = ["locked", "available", "active", "completed", "failed"];

export function effectiveQuestStatus(quest: QuestDefinition, progress: Map<string, QuestProgress>): QuestStatus {
  const saved = progress.get(quest.id)?.status;
  if (saved) return saved;
  return quest.requirements.every((requirement) => progress.get(requirement.taskId)?.status === "completed") ? "available" : "locked";
}

const statusRank: Record<QuestStatus, number> = { active: 0, available: 1, locked: 2, failed: 3, completed: 4 };

export function compareQuests(left: QuestDefinition, right: QuestDefinition, progress: Map<string, QuestProgress>) {
  const statusDelta = statusRank[effectiveQuestStatus(left, progress)] - statusRank[effectiveQuestStatus(right, progress)];
  return statusDelta
    || left.minPlayerLevel - right.minPlayerLevel
    || left.chainDepth - right.chainDepth
    || left.traderName.localeCompare(right.traderName)
    || left.name.localeCompare(right.name);
}

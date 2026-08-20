import type { QuestBundle, QuestDefinition, QuestObjectivePoi, QuestProgress, QuestStatus } from "./types";

export const questStatuses: QuestStatus[] = ["locked", "available", "active", "completed", "failed"];

export function effectiveQuestStatus(quest: QuestDefinition, progress: Map<string, QuestProgress>): QuestStatus {
  const saved = progress.get(quest.id)?.status;
  if (saved) return saved;
  return quest.requirements.every((requirement) => progress.get(requirement.taskId)?.status === "completed")
    ? "available"
    : "locked";
}

export function buildActiveQuestObjectivePois(
  bundle: QuestBundle | null,
  mapId: string,
  progress: Map<string, QuestProgress>,
): QuestObjectivePoi[] {
  if (!bundle) return [];

  return bundle.quests
    .filter((quest) => quest.mapIds.includes(mapId))
    .filter((quest) => effectiveQuestStatus(quest, progress) === "active")
    .flatMap((quest) =>
      quest.objectives.flatMap((objective) =>
        objective.zones
          .filter((zone) => zone.mapId === mapId)
          .map((zone, zoneIndex) => ({
            id: `quest-active-${quest.id}-${objective.id}-${mapId}-${zoneIndex}`,
            kind: "quest-objective" as const,
            category: "quest-objective" as const,
            name: quest.name,
            aliases: [objective.description],
            description: objective.description,
            taskId: quest.id,
            objectiveId: objective.id,
            position: zone.position,
            outline: zone.outline,
            top: zone.top,
            bottom: zone.bottom,
          })),
      ),
    );
}

const statusRank: Record<QuestStatus, number> = { active: 0, available: 1, locked: 2, failed: 3, completed: 4 };

export function compareQuests(left: QuestDefinition, right: QuestDefinition, progress: Map<string, QuestProgress>) {
  const statusDelta =
    statusRank[effectiveQuestStatus(left, progress)] - statusRank[effectiveQuestStatus(right, progress)];
  return (
    statusDelta ||
    left.minPlayerLevel - right.minPlayerLevel ||
    left.chainDepth - right.chainDepth ||
    left.traderName.localeCompare(right.traderName) ||
    left.name.localeCompare(right.name)
  );
}

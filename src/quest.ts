import type {
  QuestBundle,
  QuestDefinition,
  QuestDisplayStatus,
  QuestGameMode,
  QuestObjectivePoi,
  QuestProgress,
  QuestStatus,
} from "./types";

export const questStatuses: QuestStatus[] = ["locked", "available", "active", "completed", "failed"];

export function effectiveQuestStatus(
  quest: QuestDefinition,
  progress: Map<string, QuestProgress>,
  playerLevel?: number | null,
  gameMode: QuestGameMode = "regular",
): QuestDisplayStatus {
  const saved = progress.get(quest.id)?.status;
  if (saved) return saved;
  if (gameMode === "pvp-season") return "unknown";
  if (playerLevel !== null && playerLevel !== undefined && playerLevel < quest.minPlayerLevel) return "locked";
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
      quest.objectives.flatMap((objective) => {
        const possiblePositions = objective.possibleLocations
          .filter((location) => location.mapId === mapId)
          .flatMap((location) => location.positions)
          .filter(
            (position, index, positions) =>
              positions.findIndex(
                (candidate) => candidate.x === position.x && candidate.y === position.y && candidate.z === position.z,
              ) === index,
          );

        return [
          ...objective.zones
            .filter((zone) => zone.mapId === mapId)
            .map((zone, zoneIndex) => ({
              id: `quest-active-${quest.id}-${objective.id}-${mapId}-${zoneIndex}`,
              kind: "quest-objective" as const,
              category: "quest-objective" as const,
              mapId,
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
          ...possiblePositions.map((position, positionIndex) => ({
            id: `quest-active-${quest.id}-${objective.id}-${mapId}-possible-${positionIndex}`,
            kind: "quest-possible-location" as const,
            category: "quest-objective" as const,
            mapId,
            name: quest.name,
            aliases: [objective.description],
            description: objective.description,
            taskId: quest.id,
            objectiveId: objective.id,
            position,
            locationIndex: positionIndex,
            locationCount: possiblePositions.length,
          })),
        ];
      }),
    );
}

const statusRank: Record<QuestDisplayStatus, number> = {
  active: 0,
  available: 1,
  unknown: 2,
  locked: 3,
  failed: 4,
  completed: 5,
};

export function compareQuests(
  left: QuestDefinition,
  right: QuestDefinition,
  progress: Map<string, QuestProgress>,
  playerLevel?: number | null,
  gameMode: QuestGameMode = "regular",
) {
  const statusDelta =
    statusRank[effectiveQuestStatus(left, progress, playerLevel, gameMode)] -
    statusRank[effectiveQuestStatus(right, progress, playerLevel, gameMode)];
  return (
    statusDelta ||
    left.minPlayerLevel - right.minPlayerLevel ||
    left.chainDepth - right.chainDepth ||
    left.traderName.localeCompare(right.traderName) ||
    left.name.localeCompare(right.name)
  );
}

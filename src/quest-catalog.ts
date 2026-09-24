import type { QuestBundle, QuestGameMode, QuestObjectivePoi } from "./types";
import { parseQuestBundle, parseQuestLinks, parseQuestImages } from "./validation";

export function createQuestCatalogLoader() {
  const cache = new Map<QuestGameMode, Promise<QuestBundle>>();
  return (mode: QuestGameMode) => {
    let pending = cache.get(mode);
    if (!pending) {
      pending = fetch(`/maps/quests/${mode}.json`)
        .then(async (response) => {
          if (!response.ok) throw new Error("Bundled quest information is unavailable");
          const bundle = parseQuestBundle(await response.json());
          if (bundle.gameMode !== mode) throw new Error("Quest catalog mode does not match");
          return bundle;
        })
        .catch((error: unknown) => {
          cache.delete(mode);
          throw error;
        });
      cache.set(mode, pending);
    }
    return pending;
  };
}

export const loadQuestCatalog = createQuestCatalogLoader();

export function resolveQuestObjective(bundle: QuestBundle, poi: QuestObjectivePoi) {
  const quest = bundle.quests.find((candidate) => candidate.id === poi.taskId);
  const objective = quest?.objectives.find((candidate) => candidate.id === poi.objectiveId);
  return quest && objective ? { quest, objective } : null;
}

let linksPromise: Promise<ReturnType<typeof parseQuestLinks>> | undefined;
export function loadQuestLinks() {
  linksPromise ??= fetch("/maps/quests/wiki-links.json")
    .then(async (response) => {
      if (!response.ok) throw new Error("Wiki links unavailable");
      return parseQuestLinks(await response.json());
    })
    .catch((error: unknown) => {
      linksPromise = undefined;
      throw error;
    });
  return linksPromise;
}

let imagesPromise: Promise<ReturnType<typeof parseQuestImages>> | undefined;
export function loadQuestImages() {
  imagesPromise ??= fetch("/maps/quests/images.json")
    .then(async (response) => {
      if (!response.ok) throw new Error("Quest artwork metadata unavailable");
      return parseQuestImages(await response.json());
    })
    .catch((error: unknown) => {
      imagesPromise = undefined;
      throw error;
    });
  return imagesPromise;
}

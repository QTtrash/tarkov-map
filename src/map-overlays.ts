import type { CustomPinPoi, MapPoiBundle, PoiCategory, QuestObjectivePoi } from "./types";

export function pinsForMap(pins: CustomPinPoi[], mapId: string) {
  return pins.filter((pin) => pin.id.startsWith(`pin-${mapId}-`));
}

export function composePoiBundle(
  bundle: MapPoiBundle | null,
  mapId: string,
  activeQuestPois: QuestObjectivePoi[],
  focusedQuestPoi: QuestObjectivePoi | null,
  pins: CustomPinPoi[],
  showQuestMarkers: boolean,
): MapPoiBundle | null {
  if (!bundle) return null;
  const questPois = showQuestMarkers ? activeQuestPois.filter((poi) => poi.mapId === mapId) : [];
  if (showQuestMarkers && focusedQuestPoi?.mapId === mapId && !questPois.some((poi) => poi.id === focusedQuestPoi.id)) {
    questPois.push(focusedQuestPoi);
  }
  return {
    ...bundle,
    pois: [
      ...bundle.pois.filter((poi) => poi.category !== "quest-objective" && poi.category !== "custom-pin"),
      ...questPois,
      ...pinsForMap(pins, mapId),
    ],
  };
}

export function composeVisibleCategories(
  visible: Set<PoiCategory>,
  mapId: string,
  activeQuestPois: QuestObjectivePoi[],
  focusedQuestPoi: QuestObjectivePoi | null,
  pins: CustomPinPoi[],
  showQuestMarkers: boolean,
) {
  const categories = new Set(visible);
  if (showQuestMarkers && (activeQuestPois.some((poi) => poi.mapId === mapId) || focusedQuestPoi?.mapId === mapId)) {
    categories.add("quest-objective");
  }
  if (pinsForMap(pins, mapId).length) categories.add("custom-pin");
  return categories;
}

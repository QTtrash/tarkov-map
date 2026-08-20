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
  showQuestMarkers = true,
): MapPoiBundle | null {
  if (!bundle) return null;
  const questPois = showQuestMarkers ? [...activeQuestPois] : [];
  if (focusedQuestPoi && !questPois.some((poi) => poi.id === focusedQuestPoi.id)) questPois.push(focusedQuestPoi);
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
  showQuestMarkers = true,
) {
  const categories = new Set(visible);
  if ((showQuestMarkers && activeQuestPois.length) || focusedQuestPoi) categories.add("quest-objective");
  if (pinsForMap(pins, mapId).length) categories.add("custom-pin");
  return categories;
}

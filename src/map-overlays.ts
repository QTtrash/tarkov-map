import type { CustomPinPoi, MapPoiBundle, PoiCategory, QuestObjectivePoi } from "./types";

export function pinsForMap(pins: CustomPinPoi[], mapId: string) {
  return pins.filter((pin) => pin.id.startsWith(`pin-${mapId}-`));
}

export function composePoiBundle(
  bundle: MapPoiBundle | null,
  mapId: string,
  questPoi: QuestObjectivePoi | null,
  pins: CustomPinPoi[],
): MapPoiBundle | null {
  if (!bundle) return null;
  return {
    ...bundle,
    pois: [
      ...bundle.pois.filter((poi) => poi.category !== "quest-objective" && poi.category !== "custom-pin"),
      ...(questPoi ? [questPoi] : []),
      ...pinsForMap(pins, mapId),
    ],
  };
}

export function composeVisibleCategories(
  visible: Set<PoiCategory>,
  mapId: string,
  questPoi: QuestObjectivePoi | null,
  pins: CustomPinPoi[],
) {
  const categories = new Set(visible);
  if (questPoi) categories.add("quest-objective");
  if (pinsForMap(pins, mapId).length) categories.add("custom-pin");
  return categories;
}

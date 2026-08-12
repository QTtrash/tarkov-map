import type { MapContext } from "./types";

export interface MapSessionState {
  viewedMapId: string;
  detectedMapId: string | null;
  inRaid: boolean;
  source: string;
  browsingAway: boolean;
}

export function applyDetectedContext(state: MapSessionState, context: MapContext): MapSessionState {
  if (!context.inRaid) {
    return {
      ...state,
      detectedMapId: context.mapId,
      inRaid: false,
      source: context.source,
      browsingAway: false,
    };
  }

  if (!context.mapId) {
    return { ...state, inRaid: true, source: context.source };
  }

  const enteringRaid = !state.inRaid;
  return {
    viewedMapId: enteringRaid || !state.browsingAway ? context.mapId : state.viewedMapId,
    detectedMapId: context.mapId,
    inRaid: true,
    source: context.source,
    browsingAway: enteringRaid ? false : state.browsingAway && state.viewedMapId !== context.mapId,
  };
}

export function selectViewedMap(state: MapSessionState, mapId: string): MapSessionState {
  return {
    ...state,
    viewedMapId: mapId,
    browsingAway: Boolean(state.inRaid && state.detectedMapId && state.detectedMapId !== mapId),
  };
}

export function returnToDetectedMap(state: MapSessionState): MapSessionState {
  if (!state.detectedMapId) return state;
  return { ...state, viewedMapId: state.detectedMapId, browsingAway: false };
}

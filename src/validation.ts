import { z } from "zod";
import type {
  CustomPinPoi,
  LocatorSettings,
  LocatorSnapshot,
  LocatorStatus,
  MapContext,
  MapDefinition,
  MapPoiBundle,
  OcrTextCapture,
  OverlayState,
  PlayerFix,
  QuestBundle,
  QuestProgress,
} from "./types";

const finite = z.number().finite();
const identifier = z.string().min(1).max(128);
const mapId = z.string().regex(/^[a-z0-9-]{2,32}$/);
const vec3 = z.object({ x: finite, y: finite, z: finite });
const bounds = z.tuple([z.tuple([finite, finite]), z.tuple([finite, finite])]);
const asset = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("tiles"),
    template: z.string().min(1),
    nativeZoom: z.number().int(),
    tileSize: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("image"),
    path: z.string().min(1),
    bounds,
    calibrationStatus: z.enum(["verified", "needs-local-verification"]),
  }),
  z.object({ type: z.literal("svg"), path: z.string().min(1), baseLayer: z.string().nullable() }),
]);
const floor = z.object({
  id: identifier,
  name: z.string().min(1),
  svgLayer: z.string().nullable(),
  extents: z.array(
    z.object({
      height: z.tuple([finite, finite]),
      bounds: z
        .array(z.tuple([z.tuple([finite, finite]), z.tuple([finite, finite]), z.string().optional()]))
        .optional(),
    }),
  ),
  asset: asset.nullable(),
});
const mapDefinition = z.object({
  id: mapId,
  displayName: z.string().min(1),
  logAliases: z.array(z.string()),
  bounds,
  svgBounds: bounds.nullable(),
  transform: z.tuple([finite, finite, finite, finite]),
  coordinateRotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  minZoom: finite,
  maxZoom: finite,
  baseAsset: asset,
  baseFloor: z.object({ id: identifier, name: z.string().min(1) }),
  floors: z.array(floor),
  poiPath: z.string().startsWith("/maps/poi/"),
  poiCounts: z.record(z.string(), z.number().int().nonnegative()),
  attribution: z.object({ name: z.string().min(1), url: z.url() }),
});
const poi = z
  .object({
    id: identifier,
    kind: identifier,
    category: identifier,
    name: z.string().min(1).max(256),
    position: vec3,
    aliases: z.array(z.string()).optional(),
    outline: z.array(vec3).optional(),
    top: finite.nullable().optional(),
    bottom: finite.nullable().optional(),
  })
  .loose();
const customPin = z.object({
  id: identifier,
  kind: z.literal("custom-pin"),
  category: z.literal("custom-pin"),
  name: z.string().min(1).max(128),
  note: z.string().max(512),
  position: vec3,
});
const questProgress = z.object({
  taskId: identifier,
  status: z.enum(["locked", "available", "active", "completed", "failed"]),
  updatedAt: z.number().int().nonnegative(),
});
const settings = z.object({
  schemaVersion: z.literal(2),
  screenshotsDir: z.string().max(32_768).nullable(),
  logsDir: z.string().max(32_768).nullable(),
  alwaysOnTop: z.boolean(),
  followPlayer: z.boolean(),
  autoFloor: z.boolean(),
  deleteParsedScreenshots: z.boolean(),
  selectedMap: mapId,
  visibleMapLayers: z.array(identifier).max(64),
  legendOpen: z.boolean(),
  highContrast: z.boolean(),
  overlayOpacity: z.number().finite().min(0.35).max(1),
});
const overlayState = z.object({
  visible: z.boolean(),
  ready: z.boolean(),
  clickThrough: z.boolean(),
  shortcutReady: z.boolean(),
  lastError: z.string().nullable(),
});
const locatorSnapshot = z.object({
  fix: z
    .object({
      observedAt: z.number().int().nonnegative(),
      filename: z.string(),
      position: vec3,
      quaternion: z.object({ x: finite, y: finite, z: finite, w: finite }).nullable(),
      forward: vec3.nullable(),
      gameTime: finite.nullable(),
      mapId: mapId.nullable(),
      floorId: z.string().nullable(),
    })
    .nullable(),
  mapContext: z.object({ mapId: mapId.nullable(), inRaid: z.boolean(), source: z.string() }),
  status: z
    .object({
      level: z.enum(["info", "success", "warning", "error"]),
      message: z.string(),
      screenshotsDir: z.string().nullable(),
      logsDir: z.string().nullable(),
      screenshotWatcherReady: z.boolean(),
      logWatcherReady: z.boolean(),
      lastFilename: z.string().nullable(),
      lastError: z.string().nullable(),
    })
    .nullable(),
  ocrText: z
    .object({
      observedAt: z.number().int().nonnegative(),
      mapId: mapId.nullable(),
      rawText: z.string(),
      message: z.string(),
    })
    .nullable(),
});
const quest = z.object({
  id: identifier,
  name: z.string().min(1),
  traderId: identifier,
  traderName: z.string().min(1),
  minPlayerLevel: z.number().int().nonnegative(),
  primaryMapId: mapId.nullable(),
  mapIds: z.array(mapId),
  summary: z.string(),
  experience: z.number().nonnegative(),
  chainDepth: z.number().int().nonnegative(),
  rewardSummary: z.array(z.string()),
  objectives: z.array(
    z.object({
      id: identifier,
      description: z.string(),
      type: z.string(),
      optional: z.boolean(),
      mapIds: z.array(mapId),
      details: z.array(z.string()),
      zones: z.array(
        z.object({ mapId, position: vec3, outline: z.array(vec3), top: finite.nullable(), bottom: finite.nullable() }),
      ),
    }),
  ),
  requirements: z.array(z.object({ taskId: identifier, statuses: z.array(z.string()) })),
});

export const parseMapDefinitions = (value: unknown) => z.array(mapDefinition).min(1).parse(value) as MapDefinition[];
export const parsePoiBundle = (value: unknown) =>
  z
    .object({
      schemaVersion: z.literal(2),
      mapId,
      generatedAt: z.string().min(1),
      sources: z.array(z.string()),
      pois: z.array(poi),
    })
    .parse(value) as MapPoiBundle;
export const parseQuestBundle = (value: unknown) =>
  z
    .object({
      schemaVersion: z.literal(2),
      generatedAt: z.string().min(1),
      gameMode: z.enum(["regular", "pve"]),
      quests: z.array(quest),
    })
    .parse(value) as QuestBundle;
export const parseSettings = (value: unknown) => settings.parse(value) as LocatorSettings;
export const parseOverlayState = (value: unknown) => overlayState.parse(value) as OverlayState;
export const parseLocatorSnapshot = (value: unknown) => locatorSnapshot.parse(value) as LocatorSnapshot;
export const parsePlayerFix = (value: unknown) => locatorSnapshot.shape.fix.unwrap().parse(value) as PlayerFix;
export const parseMapContext = (value: unknown) => locatorSnapshot.shape.mapContext.parse(value) as MapContext;
export const parseLocatorStatus = (value: unknown) =>
  locatorSnapshot.shape.status.unwrap().parse(value) as LocatorStatus;
export const parseOcrText = (value: unknown) => locatorSnapshot.shape.ocrText.unwrap().parse(value) as OcrTextCapture;
export const parseCustomPins = (value: unknown) => z.array(customPin).max(500).parse(value) as CustomPinPoi[];
export const parseQuestProgress = (value: unknown) =>
  z.array(questProgress).max(10_000).parse(value) as QuestProgress[];
export const parseQuestProgressEntry = (value: unknown) => questProgress.parse(value) as QuestProgress;
export const parseAssetChecksums = (value: unknown) =>
  z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)).parse(value);

export function readStoredJson<T>(key: string, parse: (value: unknown) => T, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : parse(JSON.parse(stored));
  } catch {
    return fallback;
  }
}

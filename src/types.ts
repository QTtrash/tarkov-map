export interface LocatorSettings {
  schemaVersion: number;
  screenshotsDir: string | null;
  logsDir: string | null;
  alwaysOnTop: boolean;
  followPlayer: boolean;
  autoFloor: boolean;
  deleteParsedScreenshots: boolean;
  selectedMap: string;
  visibleMapLayers: string[];
  legendOpen: boolean;
  highContrast: boolean;
  overlayOpacity: number;
  overlayScale: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface PlayerFix {
  observedAt: number;
  filename: string;
  position: Vec3;
  quaternion: Quaternion | null;
  forward: Vec3 | null;
  gameTime: number | null;
  mapId: string | null;
  floorId: string | null;
}

export interface SquadPosition {
  senderId: string;
  sequence: number;
  nickname: string;
  mapId: string;
  position: Vec3;
  heading: number | null;
  observedAt: number;
  receivedAt: number;
}

export interface LocatorStatus {
  level: "info" | "success" | "warning" | "error";
  message: string;
  screenshotsDir: string | null;
  logsDir: string | null;
  screenshotWatcherReady: boolean;
  logWatcherReady: boolean;
  lastFilename: string | null;
  lastError: string | null;
}

export interface MapContext {
  mapId: string | null;
  inRaid: boolean;
  source: string;
}

export interface OverlayState {
  visible: boolean;
  ready: boolean;
  clickThrough: boolean;
}

export type MapAssetState =
  | { status: "idle" | "loading" | "ready"; asset: string | null; message: string | null }
  | { status: "error"; asset: string; message: string };

export interface RaidExtractState {
  mapId: string;
  status: "unknown" | "recognized" | "partial";
  activeExtractIds: string[];
  recognizedNames: string[];
  rawText: string;
  observedAt: number;
  confidence: number;
  message: string;
}

export interface OcrTextCapture {
  observedAt: number;
  mapId: string | null;
  rawText: string;
  message: string;
}

export interface FloorExtent {
  height: [number, number];
  bounds?: Array<[[number, number], [number, number], string?]>;
}

export interface RasterAsset {
  type: "tiles";
  template: string;
  nativeZoom: number;
  tileSize: number;
}

export interface ImageAsset {
  type: "image";
  path: string;
  bounds: [[number, number], [number, number]];
}

export interface SvgAsset {
  type: "svg";
  path: string;
  baseLayer: string | null;
}

export type MapAsset = RasterAsset | SvgAsset | ImageAsset;

export interface FloorDefinition {
  id: string;
  name: string;
  svgLayer: string | null;
  extents: FloorExtent[];
  asset: RasterAsset | null;
}

export interface MapDefinition {
  id: string;
  displayName: string;
  logAliases: string[];
  bounds: [[number, number], [number, number]];
  svgBounds: [[number, number], [number, number]] | null;
  transform: [number, number, number, number];
  coordinateRotation: 0 | 90 | 180 | 270;
  minZoom: number;
  maxZoom: number;
  baseAsset: MapAsset;
  baseFloor: { id: string; name: string };
  floors: FloorDefinition[];
  poiPath: string;
  poiCounts: Partial<Record<PoiCategory, number>>;
  attribution: { name: string; url: string };
}

export type PoiCategory =
  | "extract-pmc"
  | "extract-scav"
  | "extract-shared"
  | "transit"
  | "switch"
  | "hazard"
  | "btr"
  | "spawn-pmc"
  | "spawn-scav"
  | "spawn-boss"
  | "spawn-sniper"
  | "spawn-other"
  | "boss-zone"
  | "locked-door"
  | "quest-objective"
  | "custom-pin"
  | "loot"
  | "stationary-weapon";

interface PoiBase {
  id: string;
  kind: string;
  category: PoiCategory;
  name: string;
  aliases?: string[];
  position: Vec3;
  outline?: Vec3[];
  top?: number | null;
  bottom?: number | null;
}

export interface ExtractPoi extends PoiBase {
  kind: "extract";
  faction: "pmc" | "scav" | "shared";
  switchIds: string[];
  transferItem?: { itemId: string; count: number } | null;
}

export interface TransitPoi extends PoiBase {
  kind: "transit";
  sourceId: string;
}

export interface SwitchPoi extends PoiBase {
  kind: "switch";
  activates: Array<{ operation: string; targetId: string; targetKind: "extract" | "switch" }>;
}

export interface HazardPoi extends PoiBase {
  kind: "hazard";
  hazardType: string;
}

export interface BtrPoi extends PoiBase {
  kind: "btr";
}

export interface SpawnPoi extends PoiBase {
  kind: "spawn";
  zoneName: string | null;
  sides: string[];
}

export interface BossZonePoi extends PoiBase {
  kind: "boss-zone";
  bossId: string;
  bossName: string;
  spawnChance: number;
  zoneChance: number;
}

export interface LockedDoorPoi extends PoiBase {
  kind: "locked-door";
  keyIds: string[];
}

export interface QuestObjectivePoi extends PoiBase {
  kind: "quest-objective";
  taskId: string;
  objectiveId: string;
  description: string;
}

export interface CustomPinPoi extends PoiBase {
  kind: "custom-pin";
  note: string;
}

export interface LootPoi extends PoiBase {
  kind: "loot";
  lootType: string;
}

export interface StationaryWeaponPoi extends PoiBase {
  kind: "stationary-weapon";
}

export type MapPoi =
  | ExtractPoi
  | TransitPoi
  | SwitchPoi
  | HazardPoi
  | BtrPoi
  | SpawnPoi
  | BossZonePoi
  | LockedDoorPoi
  | QuestObjectivePoi
  | CustomPinPoi
  | LootPoi
  | StationaryWeaponPoi;

export interface MapPoiBundle {
  schemaVersion: 2;
  mapId: string;
  generatedAt: string;
  sources: string[];
  pois: MapPoi[];
}

export interface QuestObjective {
  id: string;
  description: string;
  type: string;
  optional: boolean;
  mapIds: string[];
  details: string[];
  zones: Array<{ mapId: string; position: Vec3; outline: Vec3[]; top: number | null; bottom: number | null }>;
}

export interface QuestDefinition {
  id: string;
  name: string;
  traderId: string;
  traderName: string;
  minPlayerLevel: number;
  primaryMapId: string | null;
  mapIds: string[];
  summary: string;
  experience: number;
  chainDepth: number;
  rewardSummary: string[];
  objectives: QuestObjective[];
  requirements: Array<{ taskId: string; statuses: string[] }>;
}

export interface QuestBundle {
  schemaVersion: 2;
  generatedAt: string;
  gameMode: "regular" | "pve";
  quests: QuestDefinition[];
}

export type QuestStatus = "locked" | "available" | "active" | "completed" | "failed";
export interface QuestProgress { taskId: string; status: QuestStatus; updatedAt: number }

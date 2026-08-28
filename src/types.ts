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
  visibleLootGroups: LootGroupId[];
  legendOpen: boolean;
  showQuestMarkers: boolean;
  highContrast: boolean;
  overlayOpacity: number;
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
  shortcutReady: boolean;
  lastError: string | null;
}

export interface LocatorSnapshot {
  fix: PlayerFix | null;
  mapContext: MapContext;
  status: LocatorStatus | null;
  ocrText: OcrTextCapture | null;
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
  calibrationStatus: "verified" | "needs-local-verification";
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

export type LootGroupId =
  | "drawers"
  | "bags"
  | "weapon-ammo"
  | "medical"
  | "technical"
  | "supply-crates"
  | "safes-cash"
  | "caches"
  | "bodies"
  | "other";

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
  kind: "quest-objective" | "quest-possible-location";
  mapId: string;
  taskId: string;
  objectiveId: string;
  description: string;
  locationIndex?: number;
  locationCount?: number;
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
  // Candidate spawn points for find-item objectives: the item is at one of these, not all of them.
  possibleLocations: Array<{ mapId: string; positions: Vec3[] }>;
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
  gameMode: QuestGameMode;
  quests: QuestDefinition[];
}

export type QuestGameMode = "regular" | "pve" | "pvp-season";
export type QuestStatus = "locked" | "available" | "active" | "completed" | "failed";
export type QuestDisplayStatus = QuestStatus | "unknown";
export interface QuestProgress {
  taskId: string;
  status: QuestStatus;
  updatedAt: number;
  source?: "manual" | "logs";
  profileKey?: string | null;
}

export interface QuestProfile {
  profileKey: string;
  gameMode: QuestGameMode;
  lastSeen: number;
  isCurrent: boolean;
  playerLevel: number | null;
}

export interface QuestLogProfilePreview {
  profileKey: string;
  gameMode: QuestGameMode;
  lastSeen: number;
  eventCount: number;
  startedCount: number;
  failedCount: number;
  completedCount: number;
  isCurrent: boolean;
}

export interface QuestSyncPreview {
  available: boolean;
  enabled: boolean;
  shouldReview: boolean;
  logsRoot: string | null;
  profiles: QuestLogProfilePreview[];
  eventCount: number;
  sessionsScanned: number;
  filesScanned: number;
  notificationFilesScanned: number;
  outputFilesScanned: number;
  chatMessageMarkers: number;
  lifecycleHints: number;
  formatStatus: "recognized" | "no-recognized-events";
  malformedRecords: number;
  unattributedRecords: number;
  suspiciousSessions: number;
  fingerprint: string;
  message: string;
}

export interface QuestSyncResult {
  importedEvents: number;
  profiles: QuestProfile[];
  detectedMode: QuestGameMode | null;
  enableQuestMarkers: boolean;
}

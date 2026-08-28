import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const mapsRoot = path.join(root, "public", "maps");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const checksums = await readJson(path.join(mapsRoot, "asset-checksums.json"));
const manifest = await readJson(path.join(mapsRoot, "data-manifest.json"));

if (
  manifest.schemaVersion !== 1 ||
  !Array.isArray(manifest.sources) ||
  manifest.assetCount !== Object.keys(checksums).length
) {
  throw new Error("Map data manifest does not match the checksum ledger");
}

for (const [relative, expected] of Object.entries(checksums)) {
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error(`Invalid checksum for ${relative}`);
  const bytes = await readFile(path.join(mapsRoot, relative));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) throw new Error(`Checksum mismatch for ${relative}`);
}

for (const mode of ["regular", "pve", "pvp-season"]) {
  const bundle = await readJson(path.join(mapsRoot, "quests", `${mode}.json`));
  if (bundle.schemaVersion !== 2 || bundle.gameMode !== mode || !Array.isArray(bundle.quests)) {
    throw new Error(`Invalid ${mode} quest bundle`);
  }
  let possibleLocationCount = 0;
  for (const quest of bundle.quests) {
    for (const objective of quest.objectives || []) {
      if (objective.possibleLocations === undefined) continue;
      if (!Array.isArray(objective.possibleLocations)) {
        throw new Error(`Invalid possible locations in ${mode} quest ${quest.id}`);
      }
      const seenMaps = new Set();
      const seenPositions = new Set();
      for (const location of objective.possibleLocations) {
        if (!/^[a-z0-9-]{2,32}$/.test(location.mapId) || seenMaps.has(location.mapId)) {
          throw new Error(`Invalid or duplicate possible-location map in ${mode} quest ${quest.id}`);
        }
        seenMaps.add(location.mapId);
        if (!Array.isArray(location.positions) || !location.positions.length || location.positions.length > 64) {
          throw new Error(`Invalid possible-location positions in ${mode} quest ${quest.id}`);
        }
        for (const position of location.positions) {
          if (![position.x, position.y, position.z].every(Number.isFinite)) {
            throw new Error(`Non-finite possible location in ${mode} quest ${quest.id}`);
          }
          const key = `${location.mapId}\u0000${position.x}\u0000${position.y}\u0000${position.z}`;
          if (seenPositions.has(key)) throw new Error(`Duplicate possible location in ${mode} quest ${quest.id}`);
          seenPositions.add(key);
          possibleLocationCount += 1;
        }
      }
    }
  }
  if (!possibleLocationCount) throw new Error(`No possible quest locations found for ${mode}`);
}

const poiFiles = Object.keys(checksums).filter((file) => file.startsWith("poi/") && file.endsWith(".json"));
if (poiFiles.length !== 13) throw new Error(`Expected 13 POI bundles, found ${poiFiles.length}`);
for (const relative of poiFiles) {
  const bundle = await readJson(path.join(mapsRoot, relative));
  if (bundle.schemaVersion !== 2 || !bundle.mapId || !bundle.generatedAt || !Array.isArray(bundle.pois)) {
    throw new Error(`Invalid POI bundle: ${relative}`);
  }
}

console.log(`Verified ${Object.keys(checksums).length} bundled assets and 16 intelligence bundles.`);

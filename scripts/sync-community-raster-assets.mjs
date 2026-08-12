import { createHash } from "node:crypto";
import { mkdir, readFile, rm, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const sources = {
  icebreaker: { url: "https://reemr.se/maps/Icebreaker/re3mrIcebreaker.png", filename: "Icebreaker-re3mr.png" },
  "the-labyrinth": { url: "https://www.re3mr.com/maps/Labyrinth/re3mrLabyrinthPNG.png", filename: "Labyrinth-re3mr.png" },
};
const icebreakerDecks = {
  "bridge-roof": [0, 553],
  bridge: [553, 1093],
  "stairs-blocked": [1093, 1631],
  "officers-deck": [1631, 2169],
  "accommodation-upper": [2169, 2709],
  "accommodation-mid": [2709, 3253],
  "accommodation-lower": [3253, 3788],
  "gym-canteen": [3788, 4322],
  helipad: [4322, 4866],
  infirmary: [4866, 5400],
  "storage-security": [5400, 5934],
  "fuel-pumps": [5934, 6478],
  "fuel-pumps-lower": [5934, 6478],
  "engine-room": [6478, 7031],
  "engine-room-upper": [6478, 7031],
  "control-room": [5400, 5934],
};

async function download(source) {
  const response = await fetch(source.url, { headers: { "user-agent": "raid-signal-asset-sync" } });
  if (!response.ok) throw new Error(`${response.status} ${source.url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 100_000 || !response.headers.get("content-type")?.includes("image")) throw new Error(`Unexpected map response: ${source.url}`);
  return bytes;
}

const mapsPath = path.join(root, "src/data/maps.generated.json");
const checksumsPath = path.join(root, "public/maps/asset-checksums.json");
const manifestPath = path.join(root, "public/maps/data-manifest.json");
const maps = JSON.parse(await readFile(mapsPath, "utf8"));
const checksums = JSON.parse(await readFile(checksumsPath, "utf8"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
await mkdir(path.join(root, "public/maps/image"), { recursive: true });
await rm(path.join(root, "public/maps/image/icebreaker"), { recursive: true, force: true });
await rm(path.join(root, "public/maps/image/labyrinth"), { recursive: true, force: true });
for (const key of Object.keys(checksums)) if (key.startsWith("tiles/icebreaker/") || key.startsWith("tiles/the-labyrinth/") || key.startsWith("image/icebreaker/") || key.startsWith("image/labyrinth/")) delete checksums[key];

for (const [mapId, source] of Object.entries(sources)) {
  const bytes = await download(source);
  const destination = path.join(root, "public/maps/image", source.filename);
  const staging = `${destination}.staging`;
  await writeFile(staging, bytes);
  await rename(staging, destination);
  checksums[`image/${source.filename}`] = createHash("sha256").update(bytes).digest("hex");
  const map = maps.find((item) => item.id === mapId);
  if (!map) throw new Error(`Missing map definition: ${mapId}`);
  if (mapId === "icebreaker") {
    for (const [floorId, [left, right]] of Object.entries(icebreakerDecks)) {
      const relative = `image/icebreaker/${floorId}.png`;
      const derived = await sharp(bytes).extract({ left, top: 240, width: right - left, height: 2250 }).png({ compressionLevel: 9 }).toBuffer();
      await mkdir(path.dirname(path.join(root, "public/maps", relative)), { recursive: true });
      await writeFile(path.join(root, "public/maps", relative), derived);
      checksums[relative] = createHash("sha256").update(derived).digest("hex");
    }
    const assetFor = (floorId) => ({ type: "image", path: `/maps/image/icebreaker/${floorId}.png`, bounds: map.bounds });
    map.baseAsset = assetFor("infirmary");
    map.floors = map.floors.map((floor) => ({ ...floor, asset: assetFor(floor.id) }));
  } else {
    const relative = "image/labyrinth/calibrated.png";
    const derived = await sharp(bytes).extract({ left: 980, top: 230, width: 3790, height: 3620 }).png({ compressionLevel: 9 }).toBuffer();
    await mkdir(path.dirname(path.join(root, "public/maps", relative)), { recursive: true });
    await writeFile(path.join(root, "public/maps", relative), derived);
    checksums[relative] = createHash("sha256").update(derived).digest("hex");
    map.baseAsset = { type: "image", path: `/maps/${relative}`, bounds: map.bounds };
  }
  map.attribution = { name: "RE3MR", url: "https://reemr.se/" };
}

await rm(path.join(root, "public/maps/tiles/icebreaker"), { recursive: true, force: true });
await rm(path.join(root, "public/maps/tiles/the-labyrinth"), { recursive: true, force: true });
manifest.generatedAt = new Date().toISOString();
manifest.sources = [...new Set([...(manifest.sources || []).filter((source) => !String(source).includes("assets.tarkov.dev")), ...Object.values(sources).map((source) => source.url), "https://reemr.se/"])];
manifest.assetCount = Object.keys(checksums).length;
await writeFile(mapsPath, `${JSON.stringify(maps, null, 2)}\n`);
await writeFile(checksumsPath, `${JSON.stringify(checksums, null, 2)}\n`);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log("Replaced Icebreaker and Labyrinth with pinned RE3MR images.");

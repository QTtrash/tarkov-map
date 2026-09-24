// Narrow image import: only existing bundled quests with map objectives. No quest text/artwork refresh.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { format } from "prettier";
import { isQuestImageSource, questImagesSchema } from "../src/quest-images.ts";

const root = new URL("../public/maps/", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const writeJson = async (path, value) => {
  const content = await format(JSON.stringify(value), { parser: "json", printWidth: 120 });
  await writeFile(new URL(path, root), content);
  return content;
};
const candidates = [];
const sources = [];
for (const gameMode of ["regular", "pve", "pvp-season"]) {
  const bundle = await readJson(`quests/${gameMode}.json`);
  const known = new Set(
    bundle.quests
      .filter((quest) =>
        quest.objectives.some((objective) => objective.zones?.length || objective.possibleLocations?.length),
      )
      .map((quest) => quest.id),
  );
  const source = `https://json.tarkov.dev/${gameMode}/tasks`;
  sources.push(source);
  const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Quest image metadata unavailable: ${gameMode}`);
  const data = await response.json();
  if (!data?.data?.tasks || typeof data.data.tasks !== "object") throw new Error("Invalid task image metadata");
  for (const task of Object.values(data.data.tasks)) {
    if (!task || !known.has(task.id) || !/^[a-f0-9]{24}$/.test(task.id)) continue;
    if (!isQuestImageSource(task.taskImageLink) || task.taskImageLink !== `https://assets.tarkov.dev/${task.id}.webp`)
      continue;
    candidates.push({
      gameMode,
      taskId: task.id,
      kind: "generic-quest",
      path: `/maps/quests/images/${task.id}.webp`,
      sourceUrl: task.taskImageLink,
    });
  }
}
const unique = [...new Map(candidates.map((entry) => [entry.taskId, entry])).values()];
const downloaded = new Map();
let cursor = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (cursor < unique.length) {
      const entry = unique[cursor++];
      const response = await fetch(entry.sourceUrl, { redirect: "error", signal: AbortSignal.timeout(30_000) });
      if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "image/webp")
        throw new Error(`Quest image unavailable: ${entry.taskId}`);
      const chunks = [];
      let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > 2_000_000) throw new Error("Quest image exceeds size limit");
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (bytes.length < 16 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP")
        throw new Error("Invalid WebP image");
      downloaded.set(entry.taskId, { bytes, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  }),
);
const images = candidates.map((entry) => ({
  ...entry,
  sha256: downloaded.get(entry.taskId).sha256,
  bytes: downloaded.get(entry.taskId).bytes.length,
}));
const metadata = questImagesSchema.parse({ schemaVersion: 1, generatedAt: new Date().toISOString(), sources, images });
await mkdir(new URL("quests/images/", root), { recursive: true });
const checksums = await readJson("asset-checksums.json");
for (const [id, image] of downloaded) {
  await writeFile(new URL(`quests/images/${id}.webp`, root), image.bytes);
  checksums[`quests/images/${id}.webp`] = image.sha256;
}
const content = await writeJson("quests/images.json", metadata);
checksums["quests/images.json"] = createHash("sha256").update(content).digest("hex");
await writeJson("asset-checksums.json", checksums);
const manifest = await readJson("data-manifest.json");
manifest.assetCount = Object.keys(checksums).length;
await writeJson("data-manifest.json", manifest);
console.log(
  `Bundled ${downloaded.size} images (${[...downloaded.values()].reduce((sum, image) => sum + image.bytes.length, 0)} bytes) for ${images.length} mode/quest pairs.`,
);

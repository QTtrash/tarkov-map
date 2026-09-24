// Only URL metadata is refreshed. Existing quest text, objectives, and artwork are untouched.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { format } from "prettier";
import { validatedWikiUrl } from "../src/quest-links.ts";

const mapsRoot = new URL("../public/maps/", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, mapsRoot), "utf8"));
const writeJson = async (path, value) => {
  const content = await format(JSON.stringify(value), { parser: "json", printWidth: 120 });
  await writeFile(new URL(path, mapsRoot), content);
  return content;
};
const sources = [];
const links = [];
for (const mode of ["regular", "pve", "pvp-season"]) {
  const bundle = await readJson(`quests/${mode}.json`);
  const known = new Set(bundle.quests.map((quest) => quest.id));
  const source = `https://json.tarkov.dev/${mode}/tasks`;
  sources.push(source);
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Quest link source unavailable: ${mode}`);
  const data = await response.json();
  if (!data?.data?.tasks || typeof data.data.tasks !== "object") throw new Error("Invalid task metadata");
  for (const task of Object.values(data.data.tasks)) {
    if (!task || typeof task !== "object" || !known.has(task.id)) continue;
    const wikiUrl = validatedWikiUrl(task.wikiLink);
    if (wikiUrl) links.push({ gameMode: mode, taskId: task.id, wikiUrl });
  }
}
links.sort((a, b) => a.gameMode.localeCompare(b.gameMode) || a.taskId.localeCompare(b.taskId));
const content = await writeJson("quests/wiki-links.json", {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sources,
  links,
});
const checksums = await readJson("asset-checksums.json");
checksums["quests/wiki-links.json"] = createHash("sha256").update(content).digest("hex");
await writeJson("asset-checksums.json", checksums);
const manifest = await readJson("data-manifest.json");
manifest.assetCount = Object.keys(checksums).length;
await writeJson("data-manifest.json", manifest);
console.log(`Recorded ${links.length} Wiki links; quest text and artwork unchanged.`);

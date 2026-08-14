import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [tag, outputPath] = process.argv.slice(2);

if (!tag || !/^v\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(tag)) {
  throw new Error("Usage: node scripts/fetch-release-manifest.mjs vMAJOR.MINOR.PATCH OUTPUT_PATH");
}

if (!outputPath) throw new Error("An output path is required");

const version = tag.slice(1);
const filename = `Raid-Signal-Setup-${version}.exe`;
const releaseRoot = `https://github.com/QTtrash/tarkov-map/releases/download/${tag}`;
const manifestUrl = `${releaseRoot}/release.json`;
const response = await fetch(manifestUrl, {
  headers: { Accept: "application/json", "User-Agent": "raid-signal-release-build" },
  redirect: "follow",
});

if (!response.ok) throw new Error(`Release manifest request failed with ${response.status}`);

const manifest = await response.json();
const expectedDownloadUrl = `${releaseRoot}/${filename}`;
const publishedAt = typeof manifest.publishedAt === "string" ? Date.parse(manifest.publishedAt) : Number.NaN;

if (
  manifest.version !== version ||
  manifest.filename !== filename ||
  manifest.downloadUrl !== expectedDownloadUrl ||
  typeof manifest.sha256 !== "string" ||
  !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
  !Number.isSafeInteger(manifest.size) ||
  manifest.size <= 0 ||
  !Number.isFinite(publishedAt)
) {
  throw new Error(`Invalid release manifest at ${manifestUrl}`);
}

const target = resolve(outputPath);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "w" });
console.log(JSON.stringify({ tag, output: target, sha256: manifest.sha256 }));

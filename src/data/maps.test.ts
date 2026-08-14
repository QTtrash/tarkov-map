import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { maps } from "./maps";
import type { MapAsset } from "../types";

function verifyAsset(asset: MapAsset) {
  if (asset.type === "svg") {
    const file = path.join(process.cwd(), "public", asset.path.replace(/^\//, ""));
    expect(existsSync(file), asset.path).toBe(true);
    const source = readFileSync(file, "utf8");
    expect(source).toContain("<svg");
    if (asset.baseLayer) expect(source).toContain(`id="${asset.baseLayer}"`);
    return;
  }

  if (asset.type === "image") {
    const file = path.join(process.cwd(), "public", asset.path.replace(/^\//, ""));
    expect(existsSync(file), asset.path).toBe(true);
    expect(readFileSync(file).byteLength, asset.path).toBeGreaterThan(100_000);
    return;
  }

  const relative = asset.template
    .replace(/^\/maps\//, "")
    .replace("{z}", String(asset.nativeZoom))
    .split("/{x}")[0];
  const directory = path.join(process.cwd(), "public", "maps", relative);
  expect(existsSync(directory), asset.template).toBe(true);
  expect(readdirSync(directory).length, asset.template).toBeGreaterThan(0);
}

function imageFile(asset: MapAsset) {
  if (asset.type !== "image") throw new Error(`Expected image asset, received ${asset.type}`);
  return path.join(process.cwd(), "public", asset.path.replace(/^\//, ""));
}

function pngDimensions(file: string) {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString("ascii"), file).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("offline map bundle", () => {
  it("contains every current interactive Tarkov map", () => {
    expect(maps).toHaveLength(13);
    expect(new Set(maps.map((map) => map.id)).size).toBe(13);
  });

  it("has local base and floor assets", () => {
    for (const map of maps) {
      verifyAsset(map.baseAsset);
      const poiFile = path.join(process.cwd(), "public", map.poiPath.replace(/^\//, ""));
      expect(existsSync(poiFile), map.poiPath).toBe(true);
      const poiBundle = JSON.parse(readFileSync(poiFile, "utf8"));
      expect(poiBundle.mapId).toBe(map.id);
      expect(Array.isArray(poiBundle.pois)).toBe(true);
      expect(poiBundle.pois.every((poi: { name?: string }) => Boolean(poi.name))).toBe(true);
      for (const floor of map.floors) {
        if (floor.asset) verifyAsset(floor.asset);
        if (floor.svgLayer && map.baseAsset.type === "svg") {
          const file = path.join(process.cwd(), "public", map.baseAsset.path.replace(/^\//, ""));
          expect(readFileSync(file, "utf8"), `${map.id}:${floor.svgLayer}`).toContain(`id="${floor.svgLayer}"`);
        }
      }
    }
  });

  it("keeps Icebreaker decks proportional and uses the correct lowest deck", () => {
    const icebreaker = maps.find((map) => map.id === "icebreaker");
    expect(icebreaker).toBeDefined();
    if (!icebreaker) return;

    const [[x1, z1], [x2, z2]] = icebreaker.bounds;
    const [scaleX, , scaleZ] = icebreaker.transform;
    const projectedAspect = Math.abs((x2 - x1) * scaleX) / Math.abs((z2 - z1) * scaleZ);
    for (const floor of icebreaker.floors) {
      if (!floor.asset) continue;
      const { width, height } = pngDimensions(imageFile(floor.asset));
      expect(width / height, floor.name).toBeCloseTo(projectedAspect, 3);
    }

    const controlRoom = icebreaker.floors.find((floor) => floor.id === "control-room")?.asset;
    const storage = icebreaker.floors.find((floor) => floor.id === "storage-security")?.asset;
    expect(controlRoom).toBeDefined();
    expect(storage).toBeDefined();
    if (!controlRoom || !storage) return;
    expect(readFileSync(imageFile(controlRoom)).equals(readFileSync(imageFile(storage)))).toBe(false);
  });
});

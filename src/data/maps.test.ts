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
          expect(readFileSync(file, "utf8"), `${map.id}:${floor.svgLayer}`)
            .toContain(`id="${floor.svgLayer}"`);
        }
      }
    }
  });
});

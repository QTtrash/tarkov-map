import { describe, expect, it } from "vitest";
import { chooseAutomaticFloor } from "./floor";
import type { MapDefinition } from "./types";

const map: MapDefinition = {
  id: "test",
  displayName: "Test",
  logAliases: [],
  bounds: [
    [100, 100],
    [-100, -100],
  ],
  svgBounds: null,
  transform: [1, 0, 1, 0],
  coordinateRotation: 0,
  minZoom: 1,
  maxZoom: 6,
  baseAsset: { type: "svg", path: "/test.svg", baseLayer: "ground" },
  baseFloor: { id: "ground", name: "Ground" },
  poiPath: "/test.json",
  poiCounts: {},
  attribution: { name: "Test", url: "https://example.com" },
  floors: [
    { id: "upper", name: "Upper", svgLayer: "upper", asset: null, extents: [{ height: [10, 20] }] },
    {
      id: "local",
      name: "Local basement",
      svgLayer: "local",
      asset: null,
      extents: [
        {
          height: [-5, 5],
          bounds: [
            [
              [0, 0],
              [10, 10],
            ],
          ],
        },
      ],
    },
  ],
};

describe("chooseAutomaticFloor", () => {
  it("matches global height extents", () => {
    expect(chooseAutomaticFloor(map, { x: 50, y: 12, z: 50 })).toBe("upper");
  });

  it("honors bounded floor extents and falls back to base", () => {
    expect(chooseAutomaticFloor(map, { x: 5, y: 0, z: 5 })).toBe("local");
    expect(chooseAutomaticFloor(map, { x: 50, y: 0, z: 50 })).toBe("ground");
  });
});

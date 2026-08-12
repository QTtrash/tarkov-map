import { describe, expect, it } from "vitest";
import { horizontalDistance, nearestExtracts, poiMatchesFloor, searchPois } from "./poi";
import type { MapDefinition, MapPoi } from "./types";

const extract = (id: string, name: string, x: number, y: number, z: number): MapPoi => ({
  id,
  kind: "extract",
  category: "extract-pmc",
  name,
  position: { x, y, z },
  faction: "pmc",
  switchIds: [],
});

const map: MapDefinition = {
  id: "test",
  displayName: "Test",
  logAliases: [],
  bounds: [[0, 0], [100, 100]],
  svgBounds: null,
  transform: [1, 0, 1, 0],
  coordinateRotation: 0,
  minZoom: 1,
  maxZoom: 6,
  baseAsset: { type: "svg", path: "/test.svg", baseLayer: "ground" },
  baseFloor: { id: "ground", name: "Ground" },
  floors: [{
    id: "upper",
    name: "Upper",
    svgLayer: "upper",
    asset: null,
    extents: [{ height: [4, 8], bounds: [[[10, 10], [30, 30]]] }],
  }],
  poiPath: "/test.json",
  poiCounts: {},
  attribution: { name: "Test", url: "https://example.com" },
};

describe("POI helpers", () => {
  it("sorts nearby extracts using horizontal map distance", () => {
    const pois = [extract("far", "Far", 30, 50, 40), extract("near", "Near", 3, -10, 4)];
    expect(horizontalDistance(pois[1].position, { x: 0, y: 999, z: 0 })).toBe(5);
    expect(nearestExtracts(pois, { x: 0, y: 0, z: 0 })[0].poi.id).toBe("near");
  });

  it("filters bounded upper-floor POIs without hiding unrelated ground markers", () => {
    const upper = extract("upper", "Upper", 20, 6, 20);
    const ground = extract("ground", "Ground", 80, 6, 80);
    expect(poiMatchesFloor(upper, map, "upper")).toBe(true);
    expect(poiMatchesFloor(upper, map, "ground")).toBe(false);
    expect(poiMatchesFloor(ground, map, "ground")).toBe(true);
  });

  it("searches names case-insensitively and limits results", () => {
    const pois = [extract("a", "Crossroads", 0, 0, 0), extract("b", "Road to Customs", 0, 0, 0)];
    expect(searchPois(pois, "ROAD", 1)).toHaveLength(1);
  });
});

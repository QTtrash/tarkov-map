import { describe, expect, it } from "vitest";
import { applyDetectedContext, returnToDetectedMap, selectViewedMap, type MapSessionState } from "./map-session";

const base: MapSessionState = {
  viewedMapId: "customs",
  detectedMapId: null,
  inRaid: false,
  source: "manual",
  browsingAway: false,
};

describe("map session", () => {
  it("follows a newly detected raid map", () => {
    expect(applyDetectedContext(base, { mapId: "woods", inRaid: true, source: "log" })).toMatchObject({
      viewedMapId: "woods", detectedMapId: "woods", inRaid: true, browsingAway: false,
    });
  });

  it("keeps a manual map while browsing during a raid", () => {
    const raid = applyDetectedContext(base, { mapId: "woods", inRaid: true, source: "log" });
    const browsing = selectViewedMap(raid, "customs");
    expect(applyDetectedContext(browsing, { mapId: "woods", inRaid: true, source: "screenshot" })).toMatchObject({
      viewedMapId: "customs", detectedMapId: "woods", browsingAway: true,
    });
  });

  it("returns explicitly to the detected raid map", () => {
    const browsing = selectViewedMap(applyDetectedContext(base, { mapId: "woods", inRaid: true, source: "log" }), "customs");
    expect(returnToDetectedMap(browsing)).toMatchObject({ viewedMapId: "woods", browsingAway: false });
  });

  it("clears the browsing override when the raid ends", () => {
    const browsing = selectViewedMap(applyDetectedContext(base, { mapId: "woods", inRaid: true, source: "log" }), "customs");
    expect(applyDetectedContext(browsing, { mapId: null, inRaid: false, source: "log" })).toMatchObject({
      viewedMapId: "customs", detectedMapId: null, inRaid: false, browsingAway: false,
    });
  });
});

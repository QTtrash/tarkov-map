import { describe, expect, it } from "vitest";
import { accumulateRaidExtracts, normalizeOcr, recognizeRaidExtracts } from "./raid";
import type { MapPoi, OcrTextCapture } from "./types";

const extracts: MapPoi[] = [
  {
    id: "zb",
    kind: "extract",
    category: "extract-pmc",
    name: "ZB-1011",
    aliases: ["EXFIL_ZB1011"],
    faction: "pmc",
    switchIds: [],
    position: { x: 0, y: 0, z: 0 },
  },
  {
    id: "dorms",
    kind: "extract",
    category: "extract-pmc",
    name: "Dorms V-Ex",
    faction: "pmc",
    switchIds: [],
    position: { x: 1, y: 0, z: 1 },
  },
];
const capture = (rawText: string): OcrTextCapture => ({
  observedAt: 1,
  mapId: "customs",
  rawText,
  message: "analyzed",
});

describe("raid extract OCR matching", () => {
  it("normalizes punctuation and matches exact panel lines", () => {
    expect(normalizeOcr("  ZB-1011 ")).toBe("zb 1011");
    expect(recognizeRaidExtracts(capture("EXFIL  ZB-1011\nDorms V-Ex"), "customs", extracts).activeExtractIds).toEqual([
      "zb",
      "dorms",
    ]);
  });

  it("does not turn unrelated HUD text into active extracts", () => {
    const result = recognizeRaidExtracts(capture("REMAINING TIME 32:14\nBODY PART HEALTH"), "customs", extracts);
    expect(result.status).toBe("unknown");
    expect(result.activeExtractIds).toEqual([]);
  });
});

describe("raid extract recognition across screenshots", () => {
  const recognized = recognizeRaidExtracts(capture("EXFIL  ZB-1011\nDorms V-Ex"), "customs", extracts);
  const withoutPanel = capture("REMAINING TIME 32:14\nBODY PART HEALTH");

  it("keeps the last reading when a later screenshot shows no exfil panel", () => {
    expect(accumulateRaidExtracts(recognized, withoutPanel, "customs", extracts)).toBe(recognized);
  });

  it("replaces the last reading when the panel is visible again", () => {
    const result = accumulateRaidExtracts(recognized, capture("Dorms V-Ex"), "customs", extracts);
    expect(result.activeExtractIds).toEqual(["dorms"]);
    expect(result).not.toBe(recognized);
  });

  it("does not carry a reading over to another map", () => {
    const result = accumulateRaidExtracts(recognized, withoutPanel, "woods", extracts);
    expect(result.mapId).toBe("woods");
    expect(result.status).toBe("unknown");
    expect(result.activeExtractIds).toEqual([]);
  });

  it("reports unknown when nothing has been recognized yet", () => {
    const result = accumulateRaidExtracts(null, withoutPanel, "customs", extracts);
    expect(result.status).toBe("unknown");
    expect(result.activeExtractIds).toEqual([]);
  });
});

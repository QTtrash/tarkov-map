import { describe, expect, it } from "vitest";
import { normalizeOcr, recognizeRaidExtracts } from "./raid";
import type { MapPoi, OcrTextCapture } from "./types";

const extracts: MapPoi[] = [
  { id: "zb", kind: "extract", category: "extract-pmc", name: "ZB-1011", aliases: ["EXFIL_ZB1011"], faction: "pmc", switchIds: [], position: { x: 0, y: 0, z: 0 } },
  { id: "dorms", kind: "extract", category: "extract-pmc", name: "Dorms V-Ex", faction: "pmc", switchIds: [], position: { x: 1, y: 0, z: 1 } },
];
const capture = (rawText: string): OcrTextCapture => ({ observedAt: 1, mapId: "customs", rawText, message: "analyzed" });

describe("raid extract OCR matching", () => {
  it("normalizes punctuation and matches exact panel lines", () => {
    expect(normalizeOcr("  ZB-1011 ")).toBe("zb 1011");
    expect(recognizeRaidExtracts(capture("EXFIL  ZB-1011\nDorms V-Ex"), "customs", extracts).activeExtractIds).toEqual(["zb", "dorms"]);
  });

  it("does not turn unrelated HUD text into active extracts", () => {
    const result = recognizeRaidExtracts(capture("REMAINING TIME 32:14\nBODY PART HEALTH"), "customs", extracts);
    expect(result.status).toBe("unknown");
    expect(result.activeExtractIds).toEqual([]);
  });
});

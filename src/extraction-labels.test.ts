import { describe, expect, it } from "vitest";
import { layoutExtractionLabels, overlaps, type LabelAnchor } from "./extraction-labels";

const anchor = (id: string, x: number, y: number): LabelAnchor => ({ id, x, y, width: 120, height: 24, priority: 0 });

describe("extraction label layout", () => {
  it("clamps edge labels, avoids controls, and keeps every visible name represented", () => {
    const anchors = [anchor("left", 2, 150), anchor("right", 298, 150), anchor("top", 150, 2)];
    const reserved = [{ x: 240, y: 220, width: 60, height: 80 }];
    const result = layoutExtractionLabels(anchors, 300, 300, reserved);
    expect(result.placed.length + result.overflow.length).toBe(3);
    for (const rect of result.placed) {
      expect(rect.x).toBeGreaterThanOrEqual(8);
      expect(rect.y).toBeGreaterThanOrEqual(8);
      expect(rect.x + rect.width).toBeLessThanOrEqual(292);
      expect(rect.y + rect.height).toBeLessThanOrEqual(292);
      expect(reserved.some((control) => overlaps(rect, control))).toBe(false);
    }
  });

  it("places active names first and sends crowded names to overflow without collisions", () => {
    const anchors = Array.from({ length: 30 }, (_, i) => anchor(String(i), 150, 150));
    anchors[29].priority = 2;
    const { placed, overflow } = layoutExtractionLabels(anchors, 300, 300);
    expect(placed[0].id).toBe("29");
    expect(overflow.length).toBeGreaterThan(0);
    expect(new Set([...placed, ...overflow].map((label) => label.id)).size).toBe(30);
    placed.forEach((rect, i) => expect(placed.slice(i + 1).some((other) => overlaps(rect, other))).toBe(false));
  });
});

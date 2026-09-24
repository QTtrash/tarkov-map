export interface LabelAnchor {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
}

export interface LabelRect extends LabelAnchor {
  anchorX: number;
  anchorY: number;
}

export function overlaps(
  a: Pick<LabelRect, "x" | "y" | "width" | "height">,
  b: Pick<LabelRect, "x" | "y" | "width" | "height">,
) {
  return a.x < b.x + b.width + 4 && a.x + a.width + 4 > b.x && a.y < b.y + b.height + 4 && a.y + a.height + 4 > b.y;
}

/** Screen-space layout; an unplaceable name must go in the visible overflow list. */
export function layoutExtractionLabels(
  anchors: LabelAnchor[],
  width: number,
  height: number,
  reserved: Array<Pick<LabelRect, "x" | "y" | "width" | "height">> = [],
) {
  const placed: LabelRect[] = [];
  const overflow: LabelAnchor[] = [];
  const visible = anchors.filter((anchor) => anchor.x >= 0 && anchor.y >= 0 && anchor.x <= width && anchor.y <= height);
  const obstacles = visible.map((anchor) => ({ x: anchor.x - 14, y: anchor.y - 14, width: 28, height: 28 }));
  for (const anchor of [...visible].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
    let found: LabelRect | undefined;
    for (const distance of [18, 42, 66, 90, 114]) {
      const candidates = [
        [anchor.x + distance, anchor.y - anchor.height / 2],
        [anchor.x - distance - anchor.width, anchor.y - anchor.height / 2],
        [anchor.x - anchor.width / 2, anchor.y - distance - anchor.height],
        [anchor.x - anchor.width / 2, anchor.y + distance],
      ];
      for (const [x, y] of candidates) {
        const rect = {
          ...anchor,
          anchorX: anchor.x,
          anchorY: anchor.y,
          x: Math.max(8, Math.min(width - anchor.width - 8, x)),
          y: Math.max(8, Math.min(height - anchor.height - 8, y)),
        };
        if (rect.x + rect.width > width - 8 || rect.y + rect.height > height - 8) continue;
        if ([...placed, ...reserved, ...obstacles].some((other) => overlaps(rect, other))) continue;
        found = rect;
        break;
      }
      if (found) break;
    }
    if (found) placed.push(found);
    else overflow.push(anchor);
  }
  return { placed, overflow };
}

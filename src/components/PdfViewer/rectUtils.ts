import type { HighlightRect } from '../../types/annotation';

/**
 * Remove rects that are too small to represent real text (e.g. whitespace
 * spans, line-break elements).  Coordinates are in normalised [0-1] space.
 */
export function filterTinyRects(
  rects: HighlightRect[],
  minW = 0.001,
  minH = 0.001,
): HighlightRect[] {
  return rects.filter(r => r.width >= minW && r.height >= minH);
}

/**
 * Merge overlapping / adjacent rects that sit on the same text line.
 *
 * `range.getClientRects()` returns one rect per inline element, so a single-
 * line selection across multiple `<span>`s produces many overlapping rects.
 * This function collapses them into one rect per visual line.
 */
export function mergeRectsOnSameLine(rects: HighlightRect[]): HighlightRect[] {
  if (rects.length <= 1) return rects;

  // Sort top-to-bottom, then left-to-right
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);

  // --- Group rects into lines ---
  const lines: HighlightRect[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const prev = lines[lines.length - 1][0]; // representative of current line

    const midA = prev.y + prev.height / 2;
    const midB = cur.y + cur.height / 2;
    const maxH = Math.max(prev.height, cur.height);
    const heightDiff = Math.abs(prev.height - cur.height);

    const sameLine =
      Math.abs(midA - midB) < 0.5 * maxH &&
      heightDiff < 0.5 * Math.min(prev.height, cur.height);

    if (sameLine) {
      lines[lines.length - 1].push(cur);
    } else {
      lines.push([cur]);
    }
  }

  // --- Merge rects within each line (interval merge on x-axis) ---
  const GAP_TOLERANCE = 0.002;
  const merged: HighlightRect[] = [];

  for (const line of lines) {
    // Already sorted by x from the global sort
    let cur = { ...line[0] };

    for (let i = 1; i < line.length; i++) {
      const r = line[i];
      const curRight = cur.x + cur.width;

      if (r.x <= curRight + GAP_TOLERANCE) {
        // Overlapping or adjacent — extend current rect
        const newRight = Math.max(curRight, r.x + r.width);
        const newTop = Math.min(cur.y, r.y);
        const newBottom = Math.max(cur.y + cur.height, r.y + r.height);
        cur.x = Math.min(cur.x, r.x);
        cur.y = newTop;
        cur.width = newRight - cur.x;
        cur.height = newBottom - newTop;
      } else {
        merged.push(cur);
        cur = { ...r };
      }
    }

    merged.push(cur);
  }

  return merged;
}

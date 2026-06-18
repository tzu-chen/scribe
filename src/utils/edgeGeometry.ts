// Shared anchor + cubic-path math for flowchart edges. Both the read-only
// renderer (measuring DOM offsets) and the editor (computing from spec state)
// resolve anchors and build Bézier paths through these helpers, so curves are
// identical everywhere.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Resolve a named anchor to a point on a node's bounding box.
 * Supports cardinal anchors (`top`/`bottom`/`left`/`right`) and fractional
 * edge anchors (`b10`–`b90` along the bottom, `t10`–`t90` along the top).
 */
export function anchorPoint(box: Box, anchorName: string): Point {
  const { x, y, w, h } = box;

  switch (anchorName) {
    case 'top': return { x: x + w / 2, y };
    case 'bottom': return { x: x + w / 2, y: y + h };
    case 'left': return { x, y: y + h / 2 };
    case 'right': return { x: x + w, y: y + h / 2 };
  }

  const pctMatch = /^([bt])(\d+)$/.exec(anchorName);
  if (pctMatch) {
    const pct = parseInt(pctMatch[2], 10) / 100;
    if (pctMatch[1] === 'b') return { x: x + w * pct, y: y + h };
    return { x: x + w * pct, y };
  }

  // Default: center-bottom
  return { x: x + w / 2, y: y + h };
}

/** Build an SVG cubic Bézier path string from anchor points + control offsets. */
export function cubicPath(
  a: Point,
  b: Point,
  c1: [number, number],
  c2: [number, number],
): string {
  return `M${a.x} ${a.y} C${a.x + c1[0]} ${a.y + c1[1]},${b.x + c2[0]} ${b.y + c2[1]},${b.x} ${b.y}`;
}

/** Read a node element's layout box (pre-transform, so zoom-safe). */
export function boxFromElement(el: HTMLElement): Box {
  return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
}

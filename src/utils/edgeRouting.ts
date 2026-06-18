import type { FlowchartEdge, FlowchartNode } from '../types/flowchart';
import { anchorPoint } from './edgeGeometry';

// Automatic edge routing. Given node geometry, choose clean anchors and Bézier
// control points for every edge so the user never hand-tunes curves. Rerun
// after any node add / move / delete; the result is written back into the spec
// (so LLM/automated round-trips still see concrete anchors + control points).

/** Fallback node height when a measured height isn't available yet. */
const DEFAULT_NODE_HEIGHT = 90;

type Direction = 'down' | 'up' | 'right' | 'left';

interface RouteBox {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Decide the dominant direction from source → target by box centers. */
function classify(from: RouteBox, to: RouteBox): Direction {
  const dy = to.cy - from.cy;
  const dx = to.cx - from.cx;
  // Treat near-horizontal pairs (within ~60% of a node height) as lateral.
  const band = 0.6 * Math.max(from.h, to.h);
  if (Math.abs(dy) <= band) return dx >= 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/** Evenly spread `count` anchors across the [30, 70] span of an edge. */
function spreadPercents(count: number): number[] {
  if (count <= 1) return [50];
  const lo = 30;
  const hi = 70;
  const step = (hi - lo) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(lo + i * step));
}

interface Classified {
  index: number;
  edge: FlowchartEdge;
  dir: Direction;
  from: RouteBox;
  to: RouteBox;
}

/**
 * Recompute `fromAnchor`, `toAnchor`, and `controlPoints` for every edge.
 * Preserves edge order and `style`. Edges whose endpoints are missing are
 * returned unchanged.
 */
export function routeEdges(
  nodes: FlowchartNode[],
  edges: FlowchartEdge[],
  heights?: Map<string, number>,
): FlowchartEdge[] {
  const boxes = new Map<string, RouteBox>();
  for (const n of nodes) {
    const h = heights?.get(n.id) ?? DEFAULT_NODE_HEIGHT;
    boxes.set(n.id, {
      x: n.x,
      y: n.y,
      w: n.width,
      h,
      cx: n.x + n.width / 2,
      cy: n.y + h / 2,
    });
  }

  const result = edges.slice();

  const classified: Classified[] = [];
  edges.forEach((edge, index) => {
    const from = boxes.get(edge.from);
    const to = boxes.get(edge.to);
    if (!from || !to) return; // keep original (validateSpec normally prevents this)
    classified.push({ index, edge, dir: classify(from, to), from, to });
  });

  // Assign source-side anchors: group vertical edges by source so multiple
  // out-edges fan out across the bottom/top edge instead of stacking.
  const fromAnchors = new Map<number, string>();
  const outGroups = new Map<string, Classified[]>();
  for (const c of classified) {
    if (c.dir === 'down' || c.dir === 'up') {
      const key = `${c.edge.from}|${c.dir}`;
      (outGroups.get(key) ?? outGroups.set(key, []).get(key)!).push(c);
    } else {
      fromAnchors.set(c.index, c.dir === 'right' ? 'right' : 'left');
    }
  }
  for (const group of outGroups.values()) {
    group.sort((a, b) => a.to.cx - b.to.cx);
    const pcts = spreadPercents(group.length);
    group.forEach((c, i) => {
      const edgeChar = c.dir === 'down' ? 'b' : 't';
      fromAnchors.set(c.index, `${edgeChar}${pcts[i]}`);
    });
  }

  // Assign target-side anchors: group vertical edges by target similarly.
  const toAnchors = new Map<number, string>();
  const inGroups = new Map<string, Classified[]>();
  for (const c of classified) {
    if (c.dir === 'down' || c.dir === 'up') {
      const key = `${c.edge.to}|${c.dir}`;
      (inGroups.get(key) ?? inGroups.set(key, []).get(key)!).push(c);
    } else {
      toAnchors.set(c.index, c.dir === 'right' ? 'left' : 'right');
    }
  }
  for (const group of inGroups.values()) {
    group.sort((a, b) => a.from.cx - b.from.cx);
    const pcts = spreadPercents(group.length);
    group.forEach((c, i) => {
      const edgeChar = c.dir === 'down' ? 't' : 'b';
      toAnchors.set(c.index, `${edgeChar}${pcts[i]}`);
    });
  }

  // Build control points from the resolved anchor points; arc magnitude scales
  // with the gap so long stage-skips bow more than adjacent hops.
  for (const c of classified) {
    const fromAnchor = fromAnchors.get(c.index)!;
    const toAnchor = toAnchors.get(c.index)!;
    const a = anchorPoint({ x: c.from.x, y: c.from.y, w: c.from.w, h: c.from.h }, fromAnchor);
    const b = anchorPoint({ x: c.to.x, y: c.to.y, w: c.to.w, h: c.to.h }, toAnchor);

    let c1: [number, number];
    let c2: [number, number];
    switch (c.dir) {
      case 'down': {
        const mag = clamp(0.45 * (b.y - a.y), 30, 150);
        c1 = [0, mag];
        c2 = [0, -mag];
        break;
      }
      case 'up': {
        const mag = clamp(0.45 * (a.y - b.y), 30, 150);
        c1 = [0, -mag];
        c2 = [0, mag];
        break;
      }
      case 'right': {
        const mag = clamp(0.45 * (b.x - a.x), 30, 120);
        c1 = [mag, 0];
        c2 = [-mag, 0];
        break;
      }
      case 'left': {
        const mag = clamp(0.45 * (a.x - b.x), 30, 120);
        c1 = [-mag, 0];
        c2 = [mag, 0];
        break;
      }
    }

    result[c.index] = {
      ...c.edge,
      fromAnchor,
      toAnchor,
      controlPoints: { c1, c2 },
    };
  }

  return result;
}

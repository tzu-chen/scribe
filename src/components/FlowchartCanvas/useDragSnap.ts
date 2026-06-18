import { useRef, useState, useCallback } from 'react';
import type { FlowchartNode } from '../../types/flowchart';

// Node dragging with grid snapping + alignment guides. Other nodes' edges are
// snapshotted at gesture start (they don't move during a drag), which keeps the
// move handler cheap and avoids touching refs during render.

export interface DragGuides {
  vertical: number[];
  horizontal: number[];
}

interface EdgeSet {
  left: number;
  cx: number;
  right: number;
  top: number;
  cy: number;
  bottom: number;
}

interface DragInfo {
  id: string;
  startX: number;
  startY: number;
  nodeX: number;
  nodeY: number;
  scale: number;
  w: number;
  h: number;
  others: EdgeSet[];
  moved: boolean;
}

interface UseDragSnapParams {
  getScale: () => number;
  nodes: FlowchartNode[];
  getHeight: (id: string) => number;
  /** When true (e.g. space held), defer to panning instead of dragging. */
  isPanModifier: () => boolean;
  onStart: () => void;
  onMove: (id: string, x: number, y: number) => void;
  onEnd: () => void;
}

const GRID = 8;
const SNAP_SCREEN_PX = 6;

function bestAlignment(dragEdges: number[], targets: number[], threshold: number) {
  let best: { delta: number; guide: number } | null = null;
  for (const t of targets) {
    for (const de of dragEdges) {
      const diff = t - de;
      if (Math.abs(diff) <= threshold && (!best || Math.abs(diff) < Math.abs(best.delta))) {
        best = { delta: diff, guide: t };
      }
    }
  }
  return best;
}

export function useDragSnap({ getScale, nodes, getHeight, isPanModifier, onStart, onMove, onEnd }: UseDragSnapParams) {
  const [guides, setGuides] = useState<DragGuides>({ vertical: [], horizontal: [] });
  const dragRef = useRef<DragInfo | null>(null);

  const onNodeMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (e.button !== 0 || isPanModifier()) return;
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      e.stopPropagation();

      const others: EdgeSet[] = nodes
        .filter((n) => n.id !== id)
        .map((n) => {
          const h = getHeight(n.id);
          return {
            left: n.x,
            cx: n.x + n.width / 2,
            right: n.x + n.width,
            top: n.y,
            cy: n.y + h / 2,
            bottom: n.y + h,
          };
        });

      dragRef.current = {
        id,
        startX: e.clientX,
        startY: e.clientY,
        nodeX: node.x,
        nodeY: node.y,
        scale: getScale(),
        w: node.width,
        h: getHeight(id),
        others,
        moved: false,
      };

      const handleMove = (ev: MouseEvent) => {
        const d = dragRef.current;
        if (!d) return;
        if (!d.moved) {
          d.moved = true;
          onStart();
        }

        let nx = d.nodeX + (ev.clientX - d.startX) / d.scale;
        let ny = d.nodeY + (ev.clientY - d.startY) / d.scale;
        const threshold = SNAP_SCREEN_PX / d.scale;

        const vertical: number[] = [];
        const horizontal: number[] = [];

        const xTargets = d.others.flatMap((o) => [o.left, o.cx, o.right]);
        const bx = bestAlignment([nx, nx + d.w / 2, nx + d.w], xTargets, threshold);
        if (bx) {
          nx += bx.delta;
          vertical.push(bx.guide);
        } else {
          nx = Math.round(nx / GRID) * GRID;
        }

        const yTargets = d.others.flatMap((o) => [o.top, o.cy, o.bottom]);
        const by = bestAlignment([ny, ny + d.h / 2, ny + d.h], yTargets, threshold);
        if (by) {
          ny += by.delta;
          horizontal.push(by.guide);
        } else {
          ny = Math.round(ny / GRID) * GRID;
        }

        nx = Math.max(0, nx);
        ny = Math.max(0, ny);
        setGuides({ vertical, horizontal });
        onMove(d.id, nx, ny);
      };

      const handleUp = () => {
        const d = dragRef.current;
        dragRef.current = null;
        setGuides({ vertical: [], horizontal: [] });
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
        if (d && d.moved) onEnd();
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    },
    [nodes, getScale, getHeight, isPanModifier, onStart, onMove, onEnd],
  );

  return { onNodeMouseDown, guides };
}

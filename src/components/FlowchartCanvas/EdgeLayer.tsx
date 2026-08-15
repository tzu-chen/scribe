import { useMemo } from 'react';
import type { FlowchartEdge, FlowchartNode } from '../../types/flowchart';
import { anchorPoint, cubicPath, type Box } from '../../utils/edgeGeometry';
import styles from './FlowchartCanvas.module.css';

export interface EdgeLayerProps {
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  /** Measured node heights by id (positions/width come from the node spec). */
  heights: Map<string, number>;
  width: number;
  height: number;
  markerId: string;
  isDark: boolean;
  /** `${from}->${to}` of the selected edge, if any. */
  selectedKey?: string | null;
  onSelectEdge?: (from: string, to: string) => void;
}

const DEFAULT_NODE_HEIGHT = 90;

/**
 * Renders flowchart edges as React SVG paths computed from the current node
 * positions. Unlike the read-only renderer's imperative drawer, this recomputes
 * on every render, so arrows track nodes live while dragging.
 */
export function EdgeLayer({
  nodes,
  edges,
  heights,
  width,
  height,
  markerId,
  isDark,
  selectedKey,
  onSelectEdge,
}: EdgeLayerProps) {
  const boxes = useMemo(() => {
    const map = new Map<string, Box>();
    for (const n of nodes) {
      map.set(n.id, { x: n.x, y: n.y, w: n.width, h: heights.get(n.id) ?? DEFAULT_NODE_HEIGHT });
    }
    return map;
  }, [nodes, heights]);

  // Palette values from monolith-theme.css: --mono-text-faint / --mono-text-muted.
  const arrowFill = isDark ? '#8b929c' : '#9e9588';
  const arrowFillHi = isDark ? '#c2c7cf' : '#6b6358';

  return (
    <svg className={styles.edgeSvg} width={width} height={height}>
      <defs>
        <marker id={markerId} viewBox="0 0 10 7" refX={9} refY={3.5} markerWidth={7} markerHeight={5.5} orient="auto">
          <polygon points="0 0.5,9 3.5,0 6.5" fill={arrowFill} />
        </marker>
        <marker id={`${markerId}-hi`} viewBox="0 0 10 7" refX={9} refY={3.5} markerWidth={7} markerHeight={5.5} orient="auto">
          <polygon points="0 0.5,9 3.5,0 6.5" fill={arrowFillHi} />
        </marker>
      </defs>

      {edges.map((edge, i) => {
        const from = boxes.get(edge.from);
        const to = boxes.get(edge.to);
        if (!from || !to) return null;

        const a = anchorPoint(from, edge.fromAnchor);
        const b = anchorPoint(to, edge.toAnchor);
        const d = cubicPath(a, b, edge.controlPoints.c1, edge.controlPoints.c2);
        const key = `${edge.from}->${edge.to}`;
        const selected = selectedKey === key;
        const isSecondary = edge.style === 'secondary';

        const stroke = selected ? arrowFillHi : isSecondary ? (isDark ? '#c58fd6' : '#7a5a99') : arrowFill;

        return (
          <g key={`${key}-${i}`}>
            {/* Wide invisible hit area for easy selection. */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              className={styles.edgeHit}
              onClick={(e) => {
                e.stopPropagation();
                onSelectEdge?.(edge.from, edge.to);
              }}
            />
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={selected ? 2.5 : 1.5}
              strokeDasharray={isSecondary ? '5,3' : undefined}
              markerEnd={`url(#${selected ? `${markerId}-hi` : markerId})`}
              pointerEvents="none"
            />
          </g>
        );
      })}
    </svg>
  );
}

import { useLayoutEffect, useCallback, type RefObject } from 'react';
import type { FlowchartEdge } from '../../types/flowchart';
import { anchorPoint, boxFromElement, cubicPath } from '../../utils/edgeGeometry';

// The rendered chart is a sheet: `spec.background` is a light paper colour that
// does not follow the UI theme, so the arrows drawn on it don't either. Values
// are the Parchment column of monolith-theme.css — --mono-text, --mono-text-faint
// and --mono-cat-3.
const SHEET_INK = '#2c2820';
const SHEET_RULE = '#9e9588';
const SHEET_RULE_ALT = '#7a5a99';

export function useFlowchartArrows(
  svgRef: RefObject<SVGSVGElement | null>,
  chartRef: RefObject<HTMLDivElement | null>,
  nodeRefs: RefObject<Map<string, HTMLDivElement>>,
  edges: FlowchartEdge[],
  ancestorMap: Map<string, number> | null,
  selectedNodeId: string | null,
  markerId: string,
): void {
  const drawArrows = useCallback(() => {
    const svg = svgRef.current;
    const chart = chartRef.current;
    const nodes = nodeRefs.current;
    if (!svg || !chart || !nodes) return;

    // Clear existing paths (keep <defs>)
    const defs = svg.querySelector('defs');
    svg.innerHTML = '';
    if (defs) svg.appendChild(defs);

    svg.setAttribute('width', String(chart.scrollWidth));
    svg.setAttribute('height', String(chart.scrollHeight));

    // Build active edge set for highlighting
    let activeEdges: Set<string> | null = null;
    if (ancestorMap && selectedNodeId) {
      activeEdges = new Set<string>();
      for (const edge of edges) {
        if (ancestorMap.has(edge.from) && ancestorMap.has(edge.to)) {
          activeEdges.add(`${edge.from}->${edge.to}`);
        }
      }
    }

    for (const edge of edges) {
      const fromEl = nodes.get(edge.from);
      const toEl = nodes.get(edge.to);
      if (!fromEl || !toEl) continue;

      const a = anchorPoint(boxFromElement(fromEl), edge.fromAnchor);
      const b = anchorPoint(boxFromElement(toEl), edge.toAnchor);
      const d = cubicPath(a, b, edge.controlPoints.c1, edge.controlPoints.c2);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.dataset.from = edge.from;
      path.dataset.to = edge.to;

      if (activeEdges) {
        const key = `${edge.from}->${edge.to}`;
        if (activeEdges.has(key)) {
          path.setAttribute('stroke', SHEET_INK);
          path.setAttribute('stroke-width', '2.5');
          path.setAttribute('stroke-opacity', '1');
          path.setAttribute('marker-end', `url(#${markerId}-hi)`);
        } else {
          path.setAttribute('stroke', SHEET_RULE);
          path.setAttribute('stroke-width', '0.8');
          path.setAttribute('stroke-opacity', '0.08');
          path.setAttribute('marker-end', `url(#${markerId}-dim)`);
          if (edge.style === 'secondary') {
            path.setAttribute('stroke-dasharray', '5,3');
          }
        }
      } else {
        // Normal state
        path.setAttribute('stroke', edge.style === 'secondary' ? SHEET_RULE_ALT : SHEET_RULE);
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('stroke-opacity', '1');
        path.setAttribute('marker-end', `url(#${markerId})`);
        if (edge.style === 'secondary') {
          path.setAttribute('stroke-dasharray', '5,3');
        }
      }

      svg.appendChild(path);
    }
  }, [svgRef, chartRef, nodeRefs, edges, ancestorMap, selectedNodeId, markerId]);

  useLayoutEffect(() => {
    drawArrows();

    const chart = chartRef.current;
    if (!chart) return;

    const observer = new ResizeObserver(() => {
      drawArrows();
    });
    observer.observe(chart);

    return () => observer.disconnect();
  }, [drawArrows, chartRef]);
}

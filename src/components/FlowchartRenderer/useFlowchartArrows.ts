import { useLayoutEffect, useCallback, type RefObject } from 'react';
import type { FlowchartEdge } from '../../types/flowchart';

interface Point {
  x: number;
  y: number;
}

function getAnchor(
  nodeEl: HTMLDivElement,
  anchorName: string,
): Point {
  const x = nodeEl.offsetLeft;
  const y = nodeEl.offsetTop;
  const w = nodeEl.offsetWidth;
  const h = nodeEl.offsetHeight;

  // Named anchors
  switch (anchorName) {
    case 'top': return { x: x + w / 2, y };
    case 'bottom': return { x: x + w / 2, y: y + h };
    case 'left': return { x, y: y + h / 2 };
    case 'right': return { x: x + w, y: y + h / 2 };
  }

  // Percentage anchors: b10-b90 (bottom), t10-t90 (top)
  const pctMatch = /^([bt])(\d+)$/.exec(anchorName);
  if (pctMatch) {
    const pct = parseInt(pctMatch[2], 10) / 100;
    if (pctMatch[1] === 'b') return { x: x + w * pct, y: y + h };
    return { x: x + w * pct, y };
  }

  // Default: center-bottom
  return { x: x + w / 2, y: y + h };
}

function cubicPath(
  a: Point,
  b: Point,
  c1: [number, number],
  c2: [number, number],
): string {
  return `M${a.x} ${a.y} C${a.x + c1[0]} ${a.y + c1[1]},${b.x + c2[0]} ${b.y + c2[1]},${b.x} ${b.y}`;
}

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

      const a = getAnchor(fromEl, edge.fromAnchor);
      const b = getAnchor(toEl, edge.toAnchor);
      const d = cubicPath(a, b, edge.controlPoints.c1, edge.controlPoints.c2);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.dataset.from = edge.from;
      path.dataset.to = edge.to;

      if (activeEdges) {
        const key = `${edge.from}->${edge.to}`;
        if (activeEdges.has(key)) {
          path.setAttribute('stroke', '#4a4a40');
          path.setAttribute('stroke-width', '2.5');
          path.setAttribute('stroke-opacity', '1');
          path.setAttribute('marker-end', `url(#${markerId}-hi)`);
        } else {
          path.setAttribute('stroke', '#a8a090');
          path.setAttribute('stroke-width', '0.8');
          path.setAttribute('stroke-opacity', '0.08');
          path.setAttribute('marker-end', `url(#${markerId}-dim)`);
          if (edge.style === 'secondary') {
            path.setAttribute('stroke-dasharray', '5,3');
          }
        }
      } else {
        // Normal state
        path.setAttribute('stroke', edge.style === 'secondary' ? '#b0a8c8' : '#a8a090');
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

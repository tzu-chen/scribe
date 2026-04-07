import { useState, useMemo, useCallback } from 'react';
import type { FlowchartEdge } from '../../types/flowchart';

interface HighlightState {
  selectedNodeId: string | null;
  ancestorMap: Map<string, number> | null;
  handleNodeClick: (nodeId: string) => void;
  clearHighlight: () => void;
}

export function useHighlight(edges: FlowchartEdge[]): HighlightState {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [ancestorMap, setAncestorMap] = useState<Map<string, number> | null>(null);

  // Build prereqs: for each edge from→to, "from" is a prerequisite of "to"
  const prereqs = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const edge of edges) {
      const list = map.get(edge.to);
      if (list) {
        list.push(edge.from);
      } else {
        map.set(edge.to, [edge.from]);
      }
    }
    return map;
  }, [edges]);

  const getAncestors = useCallback(
    (nodeId: string): Map<string, number> => {
      const depths = new Map<string, number>();
      depths.set(nodeId, 0);
      const queue = [nodeId];

      while (queue.length) {
        const cur = queue.shift()!;
        const curDepth = depths.get(cur)!;
        const preds = prereqs.get(cur);
        if (!preds) continue;

        for (const p of preds) {
          if (!depths.has(p)) {
            depths.set(p, curDepth + 1);
            queue.push(p);
          }
        }
      }

      return depths;
    },
    [prereqs],
  );

  const clearHighlight = useCallback(() => {
    setSelectedNodeId(null);
    setAncestorMap(null);
  }, []);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (nodeId === selectedNodeId) {
        clearHighlight();
      } else {
        const ancestors = getAncestors(nodeId);
        setSelectedNodeId(nodeId);
        setAncestorMap(ancestors);
      }
    },
    [selectedNodeId, getAncestors, clearHighlight],
  );

  return { selectedNodeId, ancestorMap, handleNodeClick, clearHighlight };
}

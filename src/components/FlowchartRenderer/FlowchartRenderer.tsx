import { useRef, useMemo, useCallback, useId } from 'react';
import type { FlowchartSpec, FlowchartNode, FlowchartStage } from '../../types/flowchart';
import { useTheme } from '../../contexts/ThemeContext';
import { processInlineKatex } from '../../utils/katex';
import { adjustStageColorsForDark } from './colorUtils';
import { useHighlight } from './useHighlight';
import { useFlowchartArrows } from './useFlowchartArrows';
import styles from './FlowchartRenderer.module.css';

export type NodeAction = 'write-note' | 'attach-file' | 'view-attachments' | 'view-notes' | 'add-question';

export interface NodeCounts {
  attachments: Record<string, number>;
  questions: Record<string, number>;
}

interface FlowchartRendererProps {
  spec: FlowchartSpec;
  onNodeSelect?: (nodeId: string, nodeTitle: string) => void;
  onNodeDeselect?: () => void;
  onNodeMouseDown?: (e: React.MouseEvent, nodeId: string) => void;
  onNodeDoubleClick?: (e: React.MouseEvent, nodeId: string) => void;
  onNodeAction?: (action: NodeAction, nodeId: string, nodeTitle: string) => void;
  nodeCounts?: NodeCounts;
  /** CSS class applied to the chart container (for editor overlays) */
  className?: string;
}

export function FlowchartRenderer({ spec, onNodeSelect, onNodeDeselect, onNodeMouseDown, onNodeDoubleClick, onNodeAction, nodeCounts, className }: FlowchartRendererProps) {
  const { scheme } = useTheme();
  const isDark = scheme.type === 'dark';
  const instanceId = useId();
  const markerId = `ah${instanceId.replace(/:/g, '')}`;

  const chartRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());

  const { selectedNodeId, ancestorMap, handleNodeClick, clearHighlight } = useHighlight(spec.edges);

  // Precompute stage lookup with optional dark mode adjustment
  const stageMap = useMemo(() => {
    const map = new Map<string, FlowchartStage['colors']>();
    for (const stage of spec.stages) {
      map.set(stage.key, isDark ? adjustStageColorsForDark(stage.colors) : stage.colors);
    }
    return map;
  }, [spec.stages, isDark]);

  // Stage label colors (also adjusted for dark mode)
  const stageLabelColors = useMemo(() => {
    const map = new Map<string, string>();
    for (const stage of spec.stages) {
      const colors = isDark ? adjustStageColorsForDark(stage.colors) : stage.colors;
      map.set(stage.key, colors.labelText);
    }
    return map;
  }, [spec.stages, isDark]);

  useFlowchartArrows(svgRef, chartRef, nodeRefs, spec.edges, ancestorMap, selectedNodeId, markerId);

  const setNodeRef = useCallback((nodeId: string, el: HTMLDivElement | null) => {
    if (el) {
      nodeRefs.current.set(nodeId, el);
    } else {
      nodeRefs.current.delete(nodeId);
    }
  }, []);

  const onNodeClicked = useCallback(
    (e: React.MouseEvent, node: FlowchartNode) => {
      e.stopPropagation();
      handleNodeClick(node.id);
      // Fire callbacks
      if (selectedNodeId === node.id) {
        // Was selected, now deselecting (toggle)
        onNodeDeselect?.();
      } else {
        onNodeSelect?.(node.id, node.title);
      }
    },
    [handleNodeClick, selectedNodeId, onNodeSelect, onNodeDeselect],
  );

  const onChartClicked = useCallback(() => {
    if (selectedNodeId) {
      clearHighlight();
      onNodeDeselect?.();
    }
  }, [selectedNodeId, clearHighlight, onNodeDeselect]);

  const getNodeClassName = (nodeId: string): string => {
    const classes = [styles.node];
    if (!ancestorMap) return classes.join(' ');

    if (nodeId === selectedNodeId) classes.push(styles.selected);
    else if (ancestorMap.has(nodeId)) classes.push(styles.highlighted);
    else classes.push(styles.dimmed);

    return classes.join(' ');
  };

  const getDepthBadgeText = (nodeId: string): string => {
    if (!ancestorMap) return '';
    if (nodeId === selectedNodeId) return 'selected';
    const depth = ancestorMap.get(nodeId);
    if (depth === undefined) return '';
    return depth === 1 ? '1 step' : `${depth} steps`;
  };

  return (
    <div
      ref={chartRef}
      className={`${styles.chart}${className ? ` ${className}` : ''}`}
      style={{
        width: spec.width,
        height: spec.height,
        fontFamily: spec.fonts?.body,
      }}
      onClick={onChartClicked}
    >
      {/* SVG arrow layer */}
      <svg ref={svgRef} className={styles.arrowLayer}>
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 7"
            refX={9}
            refY={3.5}
            markerWidth={7}
            markerHeight={5.5}
            orient="auto"
          >
            <polygon points="0 0.5,9 3.5,0 6.5" fill={isDark ? '#888880' : '#a0a090'} />
          </marker>
          <marker
            id={`${markerId}-hi`}
            viewBox="0 0 10 7"
            refX={9}
            refY={3.5}
            markerWidth={7}
            markerHeight={5.5}
            orient="auto"
          >
            <polygon points="0 0.5,9 3.5,0 6.5" fill={isDark ? '#c0c0b8' : '#4a4a40'} />
          </marker>
          <marker
            id={`${markerId}-dim`}
            viewBox="0 0 10 7"
            refX={9}
            refY={3.5}
            markerWidth={7}
            markerHeight={5.5}
            orient="auto"
          >
            <polygon points="0 0.5,9 3.5,0 6.5" fill={isDark ? '#555550' : '#c8c0b0'} />
          </marker>
        </defs>
      </svg>

      {/* Chart title */}
      <div className={styles.chartTitle}>
        <h1 className={styles.chartTitleH1}>{spec.title}</h1>
        {spec.subtitle && <p className={styles.chartSubtitle}>{spec.subtitle}</p>}
      </div>

      {/* Hint */}
      <div className={`${styles.hint} ${selectedNodeId ? styles.hintHidden : ''}`}>
        Click any node to trace its prerequisite chain
      </div>

      {/* Stage labels */}
      {spec.stages.map((stage) => (
        <div
          key={stage.key}
          className={styles.stageLabel}
          style={{
            left: stage.labelPosition.x,
            top: stage.labelPosition.y,
            color: stageLabelColors.get(stage.key),
          }}
        >
          {stage.label}
        </div>
      ))}

      {/* Nodes */}
      {spec.nodes.map((node) => {
        const colors = stageMap.get(node.stageKey);
        if (!colors) return null;

        return (
          <div
            key={node.id}
            ref={(el) => setNodeRef(node.id, el)}
            className={getNodeClassName(node.id)}
            style={{
              left: node.x,
              top: node.y,
              width: node.width,
              background: colors.background,
              border: `1.2px solid ${colors.border}`,
            }}
            onClick={(e) => onNodeClicked(e, node)}
            onMouseDown={onNodeMouseDown ? (e) => onNodeMouseDown(e, node.id) : undefined}
            onDoubleClick={onNodeDoubleClick ? (e) => { e.stopPropagation(); onNodeDoubleClick(e, node.id); } : undefined}
          >
            <div className={styles.depthBadge}>{getDepthBadgeText(node.id)}</div>

            {/* Node action icons — shown on selected node */}
            {onNodeAction && selectedNodeId === node.id && (
              <div className={styles.nodeActions}>
                <button
                  className={styles.nodeActionBtn}
                  title="Write note"
                  onClick={(e) => { e.stopPropagation(); onNodeAction('write-note', node.id, node.title); }}
                >
                  <svg viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                </button>
                <button
                  className={styles.nodeActionBtn}
                  title="Attach file"
                  onClick={(e) => { e.stopPropagation(); onNodeAction('attach-file', node.id, node.title); }}
                >
                  <svg viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                </button>
                <button
                  className={styles.nodeActionBtn}
                  title="View attachments"
                  onClick={(e) => { e.stopPropagation(); onNodeAction('view-attachments', node.id, node.title); }}
                >
                  <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  {(nodeCounts?.attachments[node.title] ?? 0) > 0 && (
                    <span className={styles.countBadge}>{nodeCounts!.attachments[node.title]}</span>
                  )}
                </button>
                <button
                  className={styles.nodeActionBtn}
                  title="View notes"
                  onClick={(e) => { e.stopPropagation(); onNodeAction('view-notes', node.id, node.title); }}
                >
                  <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                </button>
                <button
                  className={styles.nodeActionBtn}
                  title="Add question"
                  onClick={(e) => { e.stopPropagation(); onNodeAction('add-question', node.id, node.title); }}
                >
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  {(nodeCounts?.questions[node.id] ?? 0) > 0 && (
                    <span className={`${styles.countBadge} ${styles.countBadgeQuestion}`}>{nodeCounts!.questions[node.id]}</span>
                  )}
                </button>
              </div>
            )}

            <div
              className={styles.nodeTitle}
              style={{ color: colors.title }}
              dangerouslySetInnerHTML={{ __html: processInlineKatex(node.title) }}
            />

            <div className={styles.nodeDivider} style={{ background: colors.divider }} />

            {node.refs && (
              <div
                className={styles.nodeRefs}
                style={{ color: colors.refs }}
                dangerouslySetInnerHTML={{ __html: processInlineKatex(node.refs) }}
              />
            )}

            {node.topics && (
              <div
                className={styles.nodeTopics}
                style={{ color: colors.topics }}
                dangerouslySetInnerHTML={{ __html: processInlineKatex(node.topics) }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

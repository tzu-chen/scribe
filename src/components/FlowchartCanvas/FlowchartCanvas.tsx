import { useRef, useState, useMemo, useLayoutEffect, useEffect, useCallback, useId, useImperativeHandle, forwardRef } from 'react';
import type { FlowchartSpec, FlowchartStage } from '../../types/flowchart';
import { useTheme } from '../../contexts/ThemeContext';
import { adjustStageColorsForDark } from '../FlowchartRenderer/colorUtils';
import { NodeCard } from '../NodeCard/NodeCard';
import rendererStyles from '../FlowchartRenderer/FlowchartRenderer.module.css';
import { EdgeLayer } from './EdgeLayer';
import { useViewport, type ContentBox } from './useViewport';
import { useDragSnap } from './useDragSnap';
import styles from './FlowchartCanvas.module.css';

export interface WorldPoint {
  x: number;
  y: number;
}

export interface FlowchartCanvasHandle {
  /** World coordinate at the center of the current viewport (for placing new nodes). */
  getCenterWorld: () => WorldPoint;
}

export interface FlowchartCanvasProps {
  spec: FlowchartSpec;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  selectedEdgeKey?: string | null;
  onSelectEdge?: (from: string, to: string) => void;
  /** Enables dragging, resizing and connecting. */
  editable?: boolean;
  /** Called once at the start of a drag/resize/edit gesture (capture snapshot). */
  onGestureStart?: () => void;
  /** Live node move during drag (no undo entry). */
  onNodeMove?: (id: string, x: number, y: number) => void;
  /** Live node width change during resize (no undo entry). */
  onNodeWidth?: (id: string, width: number) => void;
  /** Called at the end of a gesture (record one undo step + reroute/save). */
  onGestureEnd?: () => void;
  /** Drag the connect handle onto another node to create an edge. */
  onConnect?: (from: string, to: string) => void;
  /** Drag a stage label to reposition it. */
  onStageMove?: (key: string, x: number, y: number) => void;
  onCanvasDoubleClick?: (world: WorldPoint) => void;
  onHeightsChange?: (heights: Map<string, number>) => void;
  /** Increment to trigger a fit-to-content. */
  fitSignal?: number;
}

const DEFAULT_NODE_HEIGHT = 90;

function computeContentBox(spec: FlowchartSpec, heights: Map<string, number>): ContentBox {
  if (spec.nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: spec.width, maxY: spec.height };
  }
  let minX = Infinity;
  let minY = 0; // include the title band at the top
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of spec.nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + (heights.get(n.id) ?? DEFAULT_NODE_HEIGHT));
  }
  return { minX, minY, maxX, maxY };
}

export const FlowchartCanvas = forwardRef<FlowchartCanvasHandle, FlowchartCanvasProps>(function FlowchartCanvas({
  spec,
  selectedNodeId,
  onSelectNode,
  selectedEdgeKey,
  onSelectEdge,
  editable = false,
  onGestureStart,
  onNodeMove,
  onNodeWidth,
  onGestureEnd,
  onConnect,
  onStageMove,
  onCanvasDoubleClick,
  onHeightsChange,
  fitSignal,
}: FlowchartCanvasProps, ref) {
  const { scheme } = useTheme();
  const isDark = scheme.type === 'dark';
  const markerId = `eh${useId().replace(/:/g, '')}`;

  const { containerRef, transform, isPanning, beginPan, screenToWorld, zoomIn, zoomOut, fit, reset, getScale } = useViewport();

  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const [heights, setHeights] = useState<Map<string, number>>(new Map());
  const heightsRef = useRef(heights);
  useEffect(() => {
    heightsRef.current = heights;
  }, [heights]);

  // Space-to-pan tracking (ignored while typing in form fields).
  const spaceRef = useRef(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  useEffect(() => {
    const isFormField = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isFormField(document.activeElement)) {
        spaceRef.current = true;
        setSpaceHeld(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        setSpaceHeld(false);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const stageColors = useMemo(() => {
    const map = new Map<string, FlowchartStage['colors']>();
    for (const stage of spec.stages) {
      map.set(stage.key, isDark ? adjustStageColorsForDark(stage.colors) : stage.colors);
    }
    return map;
  }, [spec.stages, isDark]);

  const setNodeRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(id, el);
    else nodeRefs.current.delete(id);
  }, []);

  // Measure node heights for edge routing + fit; report upward.
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    let changed = heights.size !== spec.nodes.length;
    for (const n of spec.nodes) {
      const el = nodeRefs.current.get(n.id);
      const h = el ? el.offsetHeight : heights.get(n.id) ?? DEFAULT_NODE_HEIGHT;
      next.set(n.id, h);
      if (heights.get(n.id) !== h) changed = true;
    }
    if (changed) {
      setHeights(next);
      onHeightsChange?.(next);
    }
  }, [spec.nodes, heights, onHeightsChange]);

  // Fit-to-content on first measure and whenever fitSignal changes.
  const didInitialFit = useRef(false);
  useEffect(() => {
    if (!didInitialFit.current && heights.size > 0) {
      didInitialFit.current = true;
      fit(computeContentBox(spec, heights));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heights]);

  useEffect(() => {
    if (fitSignal === undefined) return;
    fit(computeContentBox(spec, heights));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  // ── Node dragging ──
  const getHeight = useCallback((id: string) => heightsRef.current.get(id) ?? DEFAULT_NODE_HEIGHT, []);
  const isPanModifier = useCallback(() => spaceRef.current, []);
  const { onNodeMouseDown, guides } = useDragSnap({
    getScale,
    nodes: spec.nodes,
    getHeight,
    isPanModifier,
    onStart: () => onGestureStart?.(),
    onMove: (id, x, y) => onNodeMove?.(id, x, y),
    onEnd: () => onGestureEnd?.(),
  });

  // ── Node resizing ──
  const beginResize = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const node = spec.nodes.find((n) => n.id === id);
      if (!node) return;
      const info = { startX: e.clientX, startWidth: node.width, scale: getScale(), moved: false };
      const move = (ev: MouseEvent) => {
        if (!info.moved) {
          info.moved = true;
          onGestureStart?.();
        }
        const w = Math.round(Math.max(140, Math.min(480, info.startWidth + (ev.clientX - info.startX) / info.scale)));
        onNodeWidth?.(id, w);
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        if (info.moved) onGestureEnd?.();
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [spec.nodes, getScale, onGestureStart, onNodeWidth, onGestureEnd],
  );

  // ── Edge connecting (drag the connect handle onto another node) ──
  const [linkLine, setLinkLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const beginConnect = useCallback(
    (e: React.MouseEvent, fromId: string) => {
      if (e.button !== 0 || !onConnect) return;
      e.stopPropagation();
      const node = spec.nodes.find((n) => n.id === fromId);
      if (!node) return;
      const x1 = node.x + node.width / 2;
      const y1 = node.y + getHeight(fromId);
      const move = (ev: MouseEvent) => {
        const w = screenToWorld(ev.clientX, ev.clientY);
        setLinkLine({ x1, y1, x2: w.x, y2: w.y });
      };
      const up = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        setLinkLine(null);
        const target = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-node-id]');
        const toId = target?.getAttribute('data-node-id');
        if (toId && toId !== fromId) onConnect(fromId, toId);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [onConnect, spec.nodes, getHeight, screenToWorld],
  );

  const handleContainerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
        e.preventDefault();
        beginPan(e.clientX, e.clientY);
      }
    },
    [beginPan],
  );

  const handleBackgroundClick = useCallback(() => {
    onSelectNode(null);
    onSelectEdge?.('', '');
  }, [onSelectNode, onSelectEdge]);

  const worldDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!onCanvasDoubleClick) return;
      onCanvasDoubleClick(screenToWorld(e.clientX, e.clientY));
    },
    [onCanvasDoubleClick, screenToWorld],
  );

  // ── Stage label dragging ──
  const beginStageDrag = useCallback(
    (e: React.MouseEvent, key: string) => {
      if (e.button !== 0 || spaceRef.current || !onStageMove) return;
      e.stopPropagation();
      const stage = spec.stages.find((s) => s.key === key);
      if (!stage) return;
      const info = { startX: e.clientX, startY: e.clientY, sx: stage.labelPosition.x, sy: stage.labelPosition.y, scale: getScale(), moved: false };
      const move = (ev: MouseEvent) => {
        if (!info.moved) {
          info.moved = true;
          onGestureStart?.();
        }
        const nx = Math.max(0, Math.round(info.sx + (ev.clientX - info.startX) / info.scale));
        const ny = Math.max(0, Math.round(info.sy + (ev.clientY - info.startY) / info.scale));
        onStageMove(key, nx, ny);
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        if (info.moved) onGestureEnd?.();
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [onStageMove, spec.stages, getScale, onGestureStart, onGestureEnd],
  );

  useImperativeHandle(
    ref,
    () => ({
      getCenterWorld: () => {
        const el = containerRef.current;
        if (!el) return { x: spec.width / 2, y: spec.height / 2 };
        const r = el.getBoundingClientRect();
        return screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
      },
    }),
    [containerRef, screenToWorld, spec.width, spec.height],
  );

  const stageLabelColor = (stage: FlowchartStage) =>
    (isDark ? adjustStageColorsForDark(stage.colors) : stage.colors).labelText;

  return (
    <div
      ref={containerRef}
      className={`${styles.viewport}${isPanning ? ` ${styles.panning}` : spaceHeld ? ` ${styles.spaceHeld}` : ''}`}
      onMouseDown={handleContainerMouseDown}
      onClick={handleBackgroundClick}
      onDoubleClick={worldDoubleClick}
    >
      <div
        className={styles.world}
        style={{ transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})` }}
      >
        {/* Chart "page" background */}
        <div
          className={styles.chartBg}
          style={{ width: spec.width, height: spec.height, background: spec.background ?? '#faf8f4' }}
        />

        {/* Edges */}
        <EdgeLayer
          nodes={spec.nodes}
          edges={spec.edges}
          heights={heights}
          width={spec.width}
          height={spec.height}
          markerId={markerId}
          isDark={isDark}
          selectedKey={selectedEdgeKey}
          onSelectEdge={onSelectEdge}
        />

        {/* Title */}
        <div className={rendererStyles.chartTitle} style={{ fontFamily: spec.fonts?.body }}>
          <h1 className={rendererStyles.chartTitleH1}>{spec.title}</h1>
          {spec.subtitle && <p className={rendererStyles.chartSubtitle}>{spec.subtitle}</p>}
        </div>

        {/* Stage labels */}
        {spec.stages.map((stage) => (
          <div
            key={stage.key}
            className={rendererStyles.stageLabel}
            style={{
              left: stage.labelPosition.x,
              top: stage.labelPosition.y,
              color: stageLabelColor(stage),
              cursor: editable && onStageMove ? 'move' : undefined,
            }}
            onMouseDown={editable && onStageMove ? (e) => beginStageDrag(e, stage.key) : undefined}
          >
            {stage.label}
          </div>
        ))}

        {/* Alignment guides */}
        {guides.vertical.map((x, i) => (
          <div key={`gv${i}`} className={`${styles.guide} ${styles.guideV}`} style={{ left: x, top: -2000, height: 6000 }} />
        ))}
        {guides.horizontal.map((y, i) => (
          <div key={`gh${i}`} className={`${styles.guide} ${styles.guideH}`} style={{ top: y, left: -2000, width: 6000 }} />
        ))}

        {/* Connect preview line */}
        {linkLine && (
          <svg className={styles.linkSvg} width={spec.width} height={spec.height}>
            <line
              x1={linkLine.x1}
              y1={linkLine.y1}
              x2={linkLine.x2}
              y2={linkLine.y2}
              stroke="var(--color-primary)"
              strokeWidth={2}
              strokeDasharray="5,4"
            />
          </svg>
        )}

        {/* Nodes */}
        {spec.nodes.map((node) => {
          const colors = stageColors.get(node.stageKey);
          if (!colors) return null;
          const selected = selectedNodeId === node.id;
          const cls = [selected ? styles.nodeSelected : '', editable ? styles.nodeDraggable : ''].filter(Boolean).join(' ');
          return (
            <NodeCard
              key={node.id}
              node={node}
              colors={colors}
              className={cls}
              innerRef={(el) => setNodeRef(node.id, el)}
              style={{ fontFamily: spec.fonts?.body }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(node.id);
              }}
              onMouseDown={editable ? (e) => onNodeMouseDown(e, node.id) : undefined}
            >
              {editable && selected && (
                <>
                  <div className={styles.resizeHandle} title="Drag to resize width" onMouseDown={(e) => beginResize(e, node.id)} />
                  {onConnect && (
                    <div className={styles.connectHandle} title="Drag to another node to connect" onMouseDown={(e) => beginConnect(e, node.id)} />
                  )}
                </>
              )}
            </NodeCard>
          );
        })}
      </div>

      {/* Zoom controls */}
      <div className={styles.controls} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <button className={styles.controlBtn} title="Zoom out" onClick={zoomOut}>−</button>
        <span className={styles.zoomLabel} title="Reset zoom" onClick={reset}>{Math.round(transform.scale * 100)}%</span>
        <button className={styles.controlBtn} title="Zoom in" onClick={zoomIn}>+</button>
        <button className={styles.controlBtn} title="Fit to content" onClick={() => fit(computeContentBox(spec, heights))}>⤢</button>
      </div>
    </div>
  );
});

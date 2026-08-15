import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Flowchart, FlowchartSpec, FlowchartNode, FlowchartStage } from '../../types/flowchart';
import { flowchartStorage } from '../../services/flowchartStorage';
import { attachmentStorage } from '../../services/attachmentStorage';
import { questionStorage } from '../../services/questionStorage';
import { routeEdges } from '../../utils/edgeRouting';
import { generateStagePalette } from '../../components/FlowchartRenderer/colorUtils';
import { FlowchartCanvas, type FlowchartCanvasHandle, type WorldPoint } from '../../components/FlowchartCanvas/FlowchartCanvas';
import { useUndoRedo } from '../../components/FlowchartCanvas/useUndoRedo';
import { Inspector } from '../../components/FlowchartCanvas/Inspector';
import { StageManager } from '../../components/FlowchartCanvas/StageManager';
import { STAGE_ACCENTS } from '../../palette';
import styles from './FlowchartEditorPage.module.css';

type LoadState = 'loading' | 'ready' | 'notfound';
type SidebarTab = 'node' | 'stages';
type ChartMeta = Partial<Pick<FlowchartSpec, 'title' | 'subtitle' | 'background' | 'width' | 'height'>>;

const SAVE_DEBOUNCE_MS = 800;

// Arrow-key nudge deltas for the selected node.
const NUDGE: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

function slugifyId(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
}

/** Client-side spec validation mirroring the server's validateSpec (server/routes/flowcharts.ts). */
function validateSpecJson(spec: unknown): string | null {
  if (!spec || typeof spec !== 'object') return 'Spec must be an object';
  const s = spec as Record<string, unknown>;
  if (typeof s.title !== 'string') return 'spec.title is required';
  if (typeof s.width !== 'number' || typeof s.height !== 'number') return 'spec.width and spec.height must be numbers';
  if (!Array.isArray(s.stages)) return 'spec.stages must be an array';
  if (!Array.isArray(s.nodes)) return 'spec.nodes must be an array';
  const ids = new Set<string>();
  for (const raw of s.nodes) {
    const n = raw as Record<string, unknown>;
    if (!n || typeof n.id !== 'string') return 'each node needs a string id';
    if (typeof n.title !== 'string') return 'each node needs a string title';
    if (ids.has(n.id)) return `duplicate node id: ${n.id}`;
    ids.add(n.id);
  }
  if (s.edges != null) {
    if (!Array.isArray(s.edges)) return 'spec.edges must be an array';
    for (const raw of s.edges) {
      const e = raw as Record<string, unknown>;
      if (!e || typeof e.from !== 'string' || !ids.has(e.from)) return `edge references unknown node: ${String(e?.from)}`;
      if (typeof e.to !== 'string' || !ids.has(e.to)) return `edge references unknown node: ${String(e?.to)}`;
    }
  }
  return null;
}

export function FlowchartEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [flowchart, setFlowchart] = useState<Flowchart | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [fitSignal, setFitSignal] = useState(0);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('stages');
  const [linkCounts, setLinkCounts] = useState<{ attachments: Record<string, number>; questions: Record<string, number> }>({ attachments: {}, questions: {} });
  const [confirmDeleteNode, setConfirmDeleteNode] = useState<{ id: string; title: string; attachments: number; questions: number } | null>(null);
  const [jsonModal, setJsonModal] = useState<{ draft: string; error: string } | null>(null);

  const canvasRef = useRef<FlowchartCanvasHandle>(null);

  const { present: spec, reset, replace, pushPast, undo, redo, canUndo, canRedo } = useUndoRedo<FlowchartSpec>();

  // Refs kept in sync for use inside event handlers / unmount flush.
  const specRef = useRef<FlowchartSpec | null>(null);
  const flowchartRef = useRef<Flowchart | null>(null);
  const heightsRef = useRef<Map<string, number>>(new Map());
  const gestureSnapRef = useRef<FlowchartSpec | null>(null);
  const gestureDirtyRef = useRef(false);
  const lastSavedRef = useRef<string>('');
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    specRef.current = spec;
  }, [spec]);
  useEffect(() => {
    flowchartRef.current = flowchart;
  }, [flowchart]);

  // ── Load ──
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    flowchartStorage
      .getById(id)
      .then((fc) => {
        if (cancelled) return;
        if (!fc) {
          setLoadState('notfound');
          return;
        }
        setFlowchart(fc);
        reset(fc.spec);
        lastSavedRef.current = JSON.stringify(fc.spec);
        setLoadState('ready');
      })
      .catch(() => !cancelled && setLoadState('notfound'));
    return () => {
      cancelled = true;
    };
  }, [id, reset]);

  // Load cross-app link counts so node deletion can warn about orphaning.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([attachmentStorage.getCountsByNode(id), questionStorage.getCountsByNode(id)])
      .then(([attachments, questions]) => {
        if (!cancelled) setLinkCounts({ attachments, questions });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  // ── Debounced save on any spec change ──
  useEffect(() => {
    if (!spec || !flowchart) return;
    const json = JSON.stringify(spec);
    if (json === lastSavedRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaveStatus('saving');
      flowchartStorage
        .update(flowchart.id, { name: flowchart.name, description: flowchart.description, spec })
        .then(() => {
          lastSavedRef.current = json;
          setSaveStatus('saved');
        })
        .catch(() => setSaveStatus('idle'));
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [spec, flowchart]);

  // Flush any pending change when leaving the editor.
  useEffect(() => {
    return () => {
      const s = specRef.current;
      const fc = flowchartRef.current;
      if (s && fc && JSON.stringify(s) !== lastSavedRef.current) {
        flowchartStorage.update(fc.id, { name: fc.name, description: fc.description, spec: s }).catch(() => {});
      }
    };
  }, []);

  // ── Mutation helpers ──
  const reroute = useCallback(
    (s: FlowchartSpec): FlowchartSpec => ({ ...s, edges: routeEdges(s.nodes, s.edges, heightsRef.current) }),
    [],
  );

  /** Discrete change recorded as a single undo step (optionally re-routing edges). */
  const commitChange = useCallback(
    (mutator: (s: FlowchartSpec) => FlowchartSpec, doReroute = false) => {
      const snap = specRef.current;
      replace((s) => {
        const next = mutator(s);
        return doReroute ? reroute(next) : next;
      });
      if (snap) pushPast(snap);
    },
    [replace, pushPast, reroute],
  );

  // ── Gesture callbacks (drag / resize / text editing) ──
  const onGestureStart = useCallback(() => {
    gestureSnapRef.current = specRef.current;
    gestureDirtyRef.current = false;
  }, []);

  const onGestureEnd = useCallback(() => {
    if (gestureDirtyRef.current) {
      replace((s) => reroute(s));
      if (gestureSnapRef.current) pushPast(gestureSnapRef.current);
    }
    gestureSnapRef.current = null;
    gestureDirtyRef.current = false;
  }, [replace, pushPast, reroute]);

  const onNodeMove = useCallback(
    (nodeId: string, x: number, y: number) => {
      gestureDirtyRef.current = true;
      replace((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)) }));
    },
    [replace],
  );

  const onNodeWidth = useCallback(
    (nodeId: string, width: number) => {
      gestureDirtyRef.current = true;
      replace((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, width } : n)) }));
    },
    [replace],
  );

  // ── Inspector callbacks ──
  const livePatch = useCallback(
    (patch: Partial<FlowchartNode>) => {
      if (!selectedNodeId) return;
      gestureDirtyRef.current = true;
      replace((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === selectedNodeId ? { ...n, ...patch } : n)) }));
    },
    [replace, selectedNodeId],
  );

  const commitPatch = useCallback(
    (patch: Partial<FlowchartNode>) => {
      if (!selectedNodeId) return;
      commitChange((s) => ({ ...s, nodes: s.nodes.map((n) => (n.id === selectedNodeId ? { ...n, ...patch } : n)) }), true);
    },
    [commitChange, selectedNodeId],
  );

  const doDeleteNode = useCallback(
    (nodeId: string) => {
      commitChange(
        (s) => ({
          ...s,
          nodes: s.nodes.filter((n) => n.id !== nodeId),
          edges: s.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
        }),
        true,
      );
      setSelectedNodeId(null);
      setConfirmDeleteNode(null);
    },
    [commitChange],
  );

  /** Delete a node, first confirming if it has cross-app links. */
  const requestDeleteNode = useCallback(
    (nodeId: string) => {
      const node = specRef.current?.nodes.find((n) => n.id === nodeId);
      const a = linkCounts.attachments[nodeId] ?? 0;
      const q = linkCounts.questions[nodeId] ?? 0;
      if (a > 0 || q > 0) {
        setConfirmDeleteNode({ id: nodeId, title: node?.title ?? nodeId, attachments: a, questions: q });
      } else {
        doDeleteNode(nodeId);
      }
    },
    [linkCounts, doDeleteNode],
  );

  // ── Add node ──
  const addNode = useCallback(
    (world?: WorldPoint) => {
      const s = specRef.current;
      if (!s || s.stages.length === 0) return;
      let n = s.nodes.length + 1;
      let nid = `node-${n}`;
      while (s.nodes.some((node) => node.id === nid)) nid = `node-${++n}`;
      const width = 220;
      const center = world ?? canvasRef.current?.getCenterWorld() ?? { x: s.width / 2, y: s.height / 2 };
      const stageKey = (selectedNodeId && s.nodes.find((node) => node.id === selectedNodeId)?.stageKey) || s.stages[0].key;
      const node: FlowchartNode = {
        id: nid,
        stageKey,
        title: 'New Node',
        x: Math.max(0, Math.round(center.x - width / 2)),
        y: Math.max(0, Math.round(center.y - 30)),
        width,
      };
      commitChange((cur) => ({ ...cur, nodes: [...cur.nodes, node] }));
      setSelectedNodeId(nid);
      setSidebarTab('node');
    },
    [commitChange, selectedNodeId],
  );

  // ── Rename a node's stable id (updates referencing edges too) ──
  const renameNodeId = useCallback(
    (oldId: string, rawId: string) => {
      const newId = slugifyId(rawId);
      const s = specRef.current;
      if (!s || !newId || newId === oldId || s.nodes.some((n) => n.id === newId)) return;
      commitChange((cur) => ({
        ...cur,
        nodes: cur.nodes.map((n) => (n.id === oldId ? { ...n, id: newId } : n)),
        edges: cur.edges.map((e) => ({
          ...e,
          from: e.from === oldId ? newId : e.from,
          to: e.to === oldId ? newId : e.to,
        })),
      }));
      setSelectedNodeId(newId);
    },
    [commitChange],
  );

  // ── Stage handlers ──
  const addStage = useCallback(() => {
    commitChange((s) => {
      let i = s.stages.length;
      let key = `stage-${i}`;
      while (s.stages.some((st) => st.key === key)) key = `stage-${++i}`;
      const accent = STAGE_ACCENTS[s.stages.length % STAGE_ACCENTS.length];
      const lastY = s.stages.reduce((m, st) => Math.max(m, st.labelPosition.y), 0);
      const labelY = s.stages.length === 0 ? 55 : lastY + 300;
      const stage: FlowchartStage = {
        key,
        label: `Stage ${s.stages.length + 1}`,
        labelPosition: { x: 50, y: labelY },
        colors: generateStagePalette(accent),
      };
      return { ...s, stages: [...s.stages, stage] };
    });
  }, [commitChange]);

  const renameStageLive = useCallback(
    (key: string, label: string) => {
      gestureDirtyRef.current = true;
      replace((s) => ({ ...s, stages: s.stages.map((st) => (st.key === key ? { ...st, label } : st)) }));
    },
    [replace],
  );

  const recolorStageLive = useCallback(
    (key: string, accent: string) => {
      gestureDirtyRef.current = true;
      replace((s) => ({ ...s, stages: s.stages.map((st) => (st.key === key ? { ...st, colors: generateStagePalette(accent) } : st)) }));
    },
    [replace],
  );

  const deleteStage = useCallback(
    (key: string) => {
      if (specRef.current?.nodes.some((n) => n.stageKey === key)) return; // guarded in UI too
      commitChange((s) => ({ ...s, stages: s.stages.filter((st) => st.key !== key) }));
    },
    [commitChange],
  );

  const onStageMove = useCallback(
    (key: string, x: number, y: number) => {
      gestureDirtyRef.current = true;
      replace((s) => ({ ...s, stages: s.stages.map((st) => (st.key === key ? { ...st, labelPosition: { x, y } } : st)) }));
    },
    [replace],
  );

  // ── Chart meta ──
  const chartLive = useCallback(
    (patch: ChartMeta) => {
      gestureDirtyRef.current = true;
      replace((s) => ({ ...s, ...patch }));
    },
    [replace],
  );

  const chartCommit = useCallback(
    (patch: ChartMeta) => {
      commitChange((s) => ({ ...s, ...patch }));
    },
    [commitChange],
  );

  // ── JSON round-trip (LLM / automation) ──
  const openJson = useCallback(() => {
    setJsonModal({ draft: JSON.stringify(specRef.current, null, 2), error: '' });
  }, []);

  const copyJson = useCallback(() => {
    if (jsonModal) navigator.clipboard?.writeText(jsonModal.draft).catch(() => {});
  }, [jsonModal]);

  const downloadJson = useCallback(() => {
    if (!jsonModal || !flowchart) return;
    const blob = new Blob([jsonModal.draft], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${flowchart.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'flowchart'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [jsonModal, flowchart]);

  const applyJson = useCallback(() => {
    if (!jsonModal) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonModal.draft);
    } catch {
      setJsonModal({ ...jsonModal, error: 'Invalid JSON' });
      return;
    }
    const err = validateSpecJson(parsed);
    if (err) {
      setJsonModal({ ...jsonModal, error: err });
      return;
    }
    const nextSpec = parsed as FlowchartSpec;
    commitChange(() => nextSpec);
    setSelectedNodeId((cur) => (cur && nextSpec.nodes.some((n) => n.id === cur) ? cur : null));
    setSelectedEdgeKey(null);
    setJsonModal(null);
  }, [jsonModal, commitChange]);

  const deleteEdge = useCallback(
    (key: string) => {
      const [from, to] = key.split('->');
      commitChange((s) => ({ ...s, edges: s.edges.filter((e) => !(e.from === from && e.to === to)) }), true);
      setSelectedEdgeKey(null);
    },
    [commitChange],
  );

  const onConnect = useCallback(
    (from: string, to: string) => {
      if (specRef.current?.edges.some((e) => e.from === from && e.to === to)) return;
      commitChange(
        (s) => ({
          ...s,
          edges: [...s.edges, { from, to, fromAnchor: 'bottom', toAnchor: 'top', controlPoints: { c1: [0, 50], c2: [0, -50] }, style: 'primary' as const }],
        }),
        true,
      );
    },
    [commitChange],
  );

  // ── Selection ──
  const handleSelectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    if (nodeId) {
      setSelectedEdgeKey(null);
      setSidebarTab('node');
    }
  }, []);

  const handleSelectEdge = useCallback((from: string, to: string) => {
    if (!from && !to) {
      setSelectedEdgeKey(null);
      return;
    }
    setSelectedEdgeKey(`${from}->${to}`);
    setSelectedNodeId(null);
  }, []);

  const onHeightsChange = useCallback((h: Map<string, number>) => {
    heightsRef.current = h;
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const isFormField = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const onKey = (e: KeyboardEvent) => {
      if (isFormField(document.activeElement)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          e.preventDefault();
          requestDeleteNode(selectedNodeId);
        } else if (selectedEdgeKey) {
          e.preventDefault();
          deleteEdge(selectedEdgeKey);
        }
      } else if (selectedNodeId && NUDGE[e.key]) {
        e.preventDefault();
        const [dx, dy] = NUDGE[e.key];
        const step = e.shiftKey ? 10 : 1;
        commitChange(
          (s) => ({
            ...s,
            nodes: s.nodes.map((n) =>
              n.id === selectedNodeId ? { ...n, x: Math.max(0, n.x + dx * step), y: Math.max(0, n.y + dy * step) } : n,
            ),
          }),
          true,
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, selectedNodeId, selectedEdgeKey, requestDeleteNode, deleteEdge, commitChange]);

  const goToViewer = useCallback(() => {
    navigate(id ? `/flowcharts?view=${id}` : '/flowcharts');
  }, [id, navigate]);

  if (loadState === 'loading') {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading…</div>
      </div>
    );
  }

  if (loadState === 'notfound' || !spec || !flowchart) {
    return (
      <div className={styles.page}>
        <div className={styles.topbar}>
          <button className={styles.backBtn} onClick={() => navigate('/flowcharts')}>← Flowcharts</button>
        </div>
        <div className={styles.notFound}>Flowchart not found.</div>
      </div>
    );
  }

  const selectedNode = selectedNodeId ? spec.nodes.find((n) => n.id === selectedNodeId) ?? null : null;
  const saveText = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : '';
  const nodeCountByStage: Record<string, number> = {};
  for (const n of spec.nodes) nodeCountByStage[n.stageKey] = (nodeCountByStage[n.stageKey] ?? 0) + 1;
  const noStages = spec.stages.length === 0;

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <button className={styles.backBtn} onClick={goToViewer}>← Done</button>
        <span className={styles.title}>{flowchart.name}</span>
        <div className={styles.toolbar}>
          <button className={styles.toolBtn} onClick={() => addNode()} disabled={noStages} title={noStages ? 'Add a stage first' : 'Add a node (or double-click the canvas)'}>+ Node</button>
          <div className={styles.sep} />
          <button className={styles.toolBtn} onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">↶ Undo</button>
          <button className={styles.toolBtn} onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
          <div className={styles.sep} />
          <button className={styles.toolBtn} onClick={() => setFitSignal((n) => n + 1)} title="Fit to content">⤢ Fit</button>
          <button className={styles.toolBtn} onClick={openJson} title="View / edit the raw FlowchartSpec JSON">{'{ } JSON'}</button>
          {selectedEdgeKey && (
            <>
              <div className={styles.sep} />
              <button className={`${styles.toolBtn} ${styles.toolBtnDanger}`} onClick={() => deleteEdge(selectedEdgeKey)}>Delete edge</button>
            </>
          )}
          <div className={styles.sep} />
          <span className={styles.saveStatus}>{saveText}</span>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.canvasWrap}>
          <FlowchartCanvas
            ref={canvasRef}
            spec={spec}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
            selectedEdgeKey={selectedEdgeKey}
            onSelectEdge={handleSelectEdge}
            editable
            onGestureStart={onGestureStart}
            onNodeMove={onNodeMove}
            onNodeWidth={onNodeWidth}
            onGestureEnd={onGestureEnd}
            onConnect={onConnect}
            onStageMove={onStageMove}
            onCanvasDoubleClick={(world) => addNode(world)}
            onHeightsChange={onHeightsChange}
            fitSignal={fitSignal}
          />
          <div className={styles.hintBar}>
            <span>Double-click canvas to add a node</span>
            <span>Drag the blue dot to connect</span>
            <span>Scroll to zoom · Space-drag to pan</span>
          </div>
        </div>

        <aside className={styles.sidebar}>
          <div className={styles.sidebarTabs}>
            <button
              className={`${styles.tab} ${sidebarTab === 'node' ? styles.tabActive : ''}`}
              onClick={() => setSidebarTab('node')}
            >
              Node
            </button>
            <button
              className={`${styles.tab} ${sidebarTab === 'stages' ? styles.tabActive : ''}`}
              onClick={() => setSidebarTab('stages')}
            >
              Stages & Chart
            </button>
          </div>

          {sidebarTab === 'node' ? (
            <Inspector
              node={selectedNode}
              stages={spec.stages}
              onLivePatch={livePatch}
              onBeginEdit={onGestureStart}
              onEndEdit={onGestureEnd}
              onCommitPatch={commitPatch}
              onRenameId={(newId) => selectedNode && renameNodeId(selectedNode.id, newId)}
              onDelete={() => selectedNode && requestDeleteNode(selectedNode.id)}
            />
          ) : (
            <StageManager
              spec={spec}
              nodeCountByStage={nodeCountByStage}
              onBeginEdit={onGestureStart}
              onEndEdit={onGestureEnd}
              onRenameStageLive={renameStageLive}
              onRecolorStageLive={recolorStageLive}
              onDeleteStage={deleteStage}
              onAddStage={addStage}
              onChartLive={chartLive}
              onChartCommit={chartCommit}
            />
          )}
        </aside>
      </div>

      {jsonModal && (
        <div className={styles.confirmOverlay} onClick={() => setJsonModal(null)}>
          <div className={styles.jsonDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.jsonHeader}>
              <span className={styles.jsonTitle}>FlowchartSpec JSON</span>
              <div className={styles.toolbar}>
                <button className={styles.toolBtn} onClick={copyJson}>Copy</button>
                <button className={styles.toolBtn} onClick={downloadJson}>Download</button>
              </div>
            </div>
            <textarea
              className={styles.jsonTextarea}
              value={jsonModal.draft}
              spellCheck={false}
              onChange={(e) => setJsonModal({ draft: e.target.value, error: '' })}
            />
            {jsonModal.error && <p className={styles.jsonError}>{jsonModal.error}</p>}
            <div className={styles.confirmActions}>
              <button className={styles.backBtn} onClick={() => setJsonModal(null)}>Close</button>
              <button className={`${styles.toolBtn} ${styles.toolBtnActive}`} onClick={applyJson}>Apply to chart</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteNode && (
        <div className={styles.confirmOverlay} onClick={() => setConfirmDeleteNode(null)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMessage}>
              <strong>{confirmDeleteNode.title}</strong> is linked to{' '}
              {confirmDeleteNode.attachments > 0 && <>{confirmDeleteNode.attachments} attachment{confirmDeleteNode.attachments === 1 ? '' : 's'}</>}
              {confirmDeleteNode.attachments > 0 && confirmDeleteNode.questions > 0 && ' and '}
              {confirmDeleteNode.questions > 0 && <>{confirmDeleteNode.questions} question{confirmDeleteNode.questions === 1 ? '' : 's'}</>}
              . Deleting the node won't remove them, but they'll be orphaned (its key disappears). Continue?
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.backBtn} onClick={() => setConfirmDeleteNode(null)}>Cancel</button>
              <button className={`${styles.toolBtn} ${styles.toolBtnDanger}`} onClick={() => doDeleteNode(confirmDeleteNode.id)}>Delete anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

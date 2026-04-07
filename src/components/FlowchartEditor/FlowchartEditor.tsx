import { useState, useRef, useCallback, useEffect } from 'react';
import type { FlowchartSpec, FlowchartNode, FlowchartEdge } from '../../types/flowchart';
import type { NodeAction, NodeCounts } from '../FlowchartRenderer/FlowchartRenderer';
import { flowchartStorage } from '../../services/flowchartStorage';
import { FlowchartRenderer } from '../FlowchartRenderer/FlowchartRenderer';
import rendererStyles from '../FlowchartRenderer/FlowchartRenderer.module.css';
import styles from './FlowchartEditor.module.css';

interface FlowchartEditorProps {
  flowchartId: string;
  initialSpec: FlowchartSpec;
  flowchartName: string;
  flowchartDescription?: string;
  onNodeSelect?: (nodeId: string, nodeTitle: string) => void;
  onNodeDeselect?: () => void;
  onNodeAction?: (action: NodeAction, nodeId: string, nodeTitle: string) => void;
  nodeCounts?: NodeCounts;
}

type SaveStatus = 'idle' | 'saving' | 'saved';
type EditorMode = 'select' | 'addEdge';

interface EditingNode {
  nodeId: string;
  title: string;
  refs: string;
  topics: string;
  badgeText: string;
  anchorX: number;
  anchorY: number;
}

interface AddNodeForm {
  title: string;
  stageKey: string;
  width: number;
}

export function FlowchartEditor({
  flowchartId,
  initialSpec,
  flowchartName,
  flowchartDescription,
  onNodeSelect,
  onNodeDeselect,
  onNodeAction,
  nodeCounts,
}: FlowchartEditorProps) {
  const [spec, setSpec] = useState<FlowchartSpec>(initialSpec);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [mode, setMode] = useState<EditorMode>('select');
  const [editingNode, setEditingNode] = useState<EditingNode | null>(null);
  const [showAddNode, setShowAddNode] = useState(false);
  const [addNodeForm, setAddNodeForm] = useState<AddNodeForm>({
    title: '',
    stageKey: '',
    width: 220,
  });
  const [edgeSource, setEdgeSource] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'node'; id: string } | { type: 'edge'; from: string; to: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Drag state refs (not in React state to avoid re-renders during drag)
  const dragRef = useRef<{
    nodeId: string;
    startMouseX: number;
    startMouseY: number;
    startNodeX: number;
    startNodeY: number;
  } | null>(null);

  // Debounced save refs
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Clean up timers
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  // ─── Debounced save (PATCH for single node, PUT for structural changes) ───

  const debouncedPatchNode = useCallback(
    (nodeId: string, updates: Record<string, unknown>) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        setSaveStatus('saving');
        try {
          await flowchartStorage.updateNode(flowchartId, nodeId, updates);
          setSaveStatus('saved');
          savedTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
        } catch {
          setSaveStatus('idle');
        }
      }, 1500);
    },
    [flowchartId],
  );

  const saveFullSpec = useCallback(
    async (newSpec: FlowchartSpec) => {
      setSaveStatus('saving');
      try {
        await flowchartStorage.update(flowchartId, {
          name: flowchartName,
          description: flowchartDescription,
          spec: newSpec,
        });
        setSaveStatus('saved');
        if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
        savedTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('idle');
      }
    },
    [flowchartId, flowchartName, flowchartDescription],
  );

  // ─── Drag-to-reposition ───

  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      if (mode !== 'select') return;
      if (e.button !== 0) return; // left click only

      const node = spec.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      dragRef.current = {
        nodeId,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startNodeX: node.x,
        startNodeY: node.y,
      };
    },
    [mode, spec.nodes],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (!isDragging) setIsDragging(true);

      const dx = e.clientX - drag.startMouseX;
      const dy = e.clientY - drag.startMouseY;
      const newX = Math.max(0, drag.startNodeX + dx);
      const newY = Math.max(0, drag.startNodeY + dy);

      setSpec((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) =>
          n.id === drag.nodeId ? { ...n, x: newX, y: newY } : n,
        ),
      }));
    };

    const handleMouseUp = () => {
      const drag = dragRef.current;
      if (!drag) return;

      if (isDragging) {
        // Find the final position and save
        const node = spec.nodes.find((n) => n.id === drag.nodeId);
        if (node) {
          debouncedPatchNode(drag.nodeId, { x: node.x, y: node.y });
        }
      }

      dragRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, spec.nodes, debouncedPatchNode]);

  // ─── Inline text editing ───

  const handleNodeDoubleClick = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      if (mode !== 'select') return;

      const node = spec.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      setEditingNode({
        nodeId,
        title: node.title,
        refs: node.refs ?? '',
        topics: node.topics ?? '',
        badgeText: node.badge?.text ?? '',
        anchorX: e.clientX,
        anchorY: e.clientY,
      });
    },
    [mode, spec.nodes],
  );

  const saveEditingNode = useCallback(() => {
    if (!editingNode) return;

    const updates: Record<string, unknown> = {
      title: editingNode.title,
      refs: editingNode.refs || undefined,
      topics: editingNode.topics || undefined,
    };

    if (editingNode.badgeText) {
      const existingNode = spec.nodes.find((n) => n.id === editingNode.nodeId);
      updates.badge = {
        text: editingNode.badgeText,
        style: existingNode?.badge?.style ?? 'default',
        background: existingNode?.badge?.background,
        color: existingNode?.badge?.color,
      };
    } else {
      updates.badge = undefined;
    }

    setSpec((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === editingNode.nodeId
          ? {
              ...n,
              title: editingNode.title,
              refs: editingNode.refs || undefined,
              topics: editingNode.topics || undefined,
              badge: editingNode.badgeText
                ? { text: editingNode.badgeText, style: n.badge?.style ?? 'default', background: n.badge?.background, color: n.badge?.color }
                : undefined,
            }
          : n,
      ),
    }));

    debouncedPatchNode(editingNode.nodeId, updates);
    setEditingNode(null);
  }, [editingNode, spec.nodes, debouncedPatchNode]);

  // ─── Add node ───

  const handleAddNode = useCallback(() => {
    if (!addNodeForm.title.trim() || !addNodeForm.stageKey) return;

    // Generate a short ID from the title
    const nodeId = addNodeForm.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20);

    // Check for duplicate
    if (spec.nodes.some((n) => n.id === nodeId)) return;

    // Find a sensible default position (below existing nodes of this stage, or top-left)
    const stageNodes = spec.nodes.filter((n) => n.stageKey === addNodeForm.stageKey);
    const defaultX = stageNodes.length > 0
      ? Math.max(...stageNodes.map((n) => n.x + n.width)) + 40
      : 30;
    const defaultY = stageNodes.length > 0
      ? stageNodes[0].y
      : 112;

    const newNode: FlowchartNode = {
      id: nodeId,
      stageKey: addNodeForm.stageKey,
      title: addNodeForm.title.trim(),
      x: Math.min(defaultX, spec.width - addNodeForm.width - 30),
      y: defaultY,
      width: addNodeForm.width,
    };

    const newSpec = { ...spec, nodes: [...spec.nodes, newNode] };
    setSpec(newSpec);
    saveFullSpec(newSpec);
    setShowAddNode(false);
    setAddNodeForm({ title: '', stageKey: '', width: 220 });
  }, [addNodeForm, spec, saveFullSpec]);

  // ─── Delete node ───

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const newSpec = {
        ...spec,
        nodes: spec.nodes.filter((n) => n.id !== nodeId),
        edges: spec.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
      };
      setSpec(newSpec);
      saveFullSpec(newSpec);
      setConfirmDelete(null);
      setSelectedNodeId(null);
    },
    [spec, saveFullSpec],
  );

  // ─── Add edge mode ───

  const handleNodeClickForEdge = useCallback(
    (nodeId: string) => {
      if (mode !== 'addEdge') return;

      if (!edgeSource) {
        setEdgeSource(nodeId);
      } else {
        if (nodeId === edgeSource) {
          setEdgeSource(null);
          return;
        }

        // Check for duplicate edge
        if (spec.edges.some((e) => e.from === edgeSource && e.to === nodeId)) {
          setEdgeSource(null);
          setMode('select');
          return;
        }

        const newEdge: FlowchartEdge = {
          from: edgeSource,
          to: nodeId,
          fromAnchor: 'bottom',
          toAnchor: 'top',
          controlPoints: { c1: [0, 50], c2: [0, -50] },
          style: 'primary',
        };

        const newSpec = { ...spec, edges: [...spec.edges, newEdge] };
        setSpec(newSpec);
        saveFullSpec(newSpec);
        setEdgeSource(null);
        setMode('select');
      }
    },
    [mode, edgeSource, spec, saveFullSpec],
  );

  // ─── Delete edge ───

  const handleDeleteEdge = useCallback(
    (from: string, to: string) => {
      const newSpec = {
        ...spec,
        edges: spec.edges.filter((e) => !(e.from === from && e.to === to)),
      };
      setSpec(newSpec);
      saveFullSpec(newSpec);
      setConfirmDelete(null);
    },
    [spec, saveFullSpec],
  );

  // ─── Node select handler (forwards to parent + tracks locally) ───

  const handleNodeSelect = useCallback(
    (nodeId: string, nodeTitle: string) => {
      if (mode === 'addEdge') {
        handleNodeClickForEdge(nodeId);
        return;
      }
      setSelectedNodeId(nodeId);
      onNodeSelect?.(nodeId, nodeTitle);
    },
    [mode, handleNodeClickForEdge, onNodeSelect],
  );

  const handleNodeDeselect = useCallback(() => {
    setSelectedNodeId(null);
    onNodeDeselect?.();
  }, [onNodeDeselect]);

  // ─── Render ───

  const saveStatusText =
    saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : '';

  return (
    <div className={styles.wrapper}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <button
            className={styles.toolbarButton}
            onClick={() => setShowAddNode((prev) => !prev)}
          >
            + Node
          </button>

          <button
            className={`${styles.toolbarButton} ${mode === 'addEdge' ? styles.toolbarButtonActive : ''}`}
            onClick={() => {
              if (mode === 'addEdge') {
                setMode('select');
                setEdgeSource(null);
              } else {
                setMode('addEdge');
                setEdgeSource(null);
              }
            }}
          >
            + Edge
          </button>
        </div>

        {selectedNodeId && mode === 'select' && (
          <>
            <div className={styles.toolbarSeparator} />
            <div className={styles.toolbarGroup}>
              <button
                className={`${styles.toolbarButton} ${styles.toolbarButtonDanger}`}
                onClick={() => setConfirmDelete({ type: 'node', id: selectedNodeId })}
              >
                Delete Node
              </button>
            </div>
          </>
        )}

        {mode === 'addEdge' && (
          <>
            <div className={styles.toolbarSeparator} />
            <span className={styles.edgeModeLabel}>
              {edgeSource
                ? `Click target node (source: ${spec.nodes.find(n => n.id === edgeSource)?.title ?? edgeSource})`
                : 'Click source node'}
            </span>
          </>
        )}

        {saveStatusText && <span className={styles.saveStatus}>{saveStatusText}</span>}
      </div>

      {/* Add node form */}
      {showAddNode && (
        <div className={styles.addNodeForm}>
          <div className={styles.addNodeFormRow}>
            <div className={styles.editField} style={{ flex: 1 }}>
              <label className={styles.editFieldLabel}>Title</label>
              <input
                className={styles.editFieldInput}
                value={addNodeForm.title}
                onChange={(e) => setAddNodeForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Node title"
                autoFocus
              />
            </div>
            <div className={styles.editField}>
              <label className={styles.editFieldLabel}>Stage</label>
              <select
                className={styles.editFieldSelect}
                value={addNodeForm.stageKey}
                onChange={(e) => setAddNodeForm((f) => ({ ...f, stageKey: e.target.value }))}
              >
                <option value="">Select stage</option>
                {spec.stages.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className={styles.editField}>
              <label className={styles.editFieldLabel}>Width</label>
              <input
                className={styles.editFieldInput}
                type="number"
                value={addNodeForm.width}
                onChange={(e) => setAddNodeForm((f) => ({ ...f, width: Number(e.target.value) }))}
                style={{ width: 70 }}
              />
            </div>
          </div>
          <div className={styles.addNodeFormActions}>
            <button className={styles.formButton} onClick={() => setShowAddNode(false)}>Cancel</button>
            <button
              className={`${styles.formButton} ${styles.formButtonPrimary}`}
              onClick={handleAddNode}
              disabled={!addNodeForm.title.trim() || !addNodeForm.stageKey}
            >
              Add Node
            </button>
          </div>
        </div>
      )}

      {/* Flowchart renderer */}
      <FlowchartRenderer
        spec={spec}
        onNodeSelect={handleNodeSelect}
        onNodeDeselect={handleNodeDeselect}
        onNodeMouseDown={handleNodeMouseDown}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeAction={onNodeAction}
        nodeCounts={nodeCounts}
        className={isDragging ? rendererStyles.dragging : undefined}
      />

      {/* Node edit panel */}
      {editingNode && (
        <div
          className={styles.editPanel}
          style={{
            left: Math.min(editingNode.anchorX, window.innerWidth - 340),
            top: Math.min(editingNode.anchorY, window.innerHeight - 400),
          }}
        >
          <div className={styles.editPanelHeader}>
            <span className={styles.editPanelTitle}>Edit Node</span>
            <button className={styles.editPanelClose} onClick={saveEditingNode}>
              &times;
            </button>
          </div>

          <div className={styles.editField}>
            <label className={styles.editFieldLabel}>Title</label>
            <input
              className={styles.editFieldInput}
              value={editingNode.title}
              onChange={(e) => setEditingNode((prev) => prev ? { ...prev, title: e.target.value } : null)}
              autoFocus
            />
          </div>

          <div className={styles.editField}>
            <label className={styles.editFieldLabel}>References</label>
            <textarea
              className={`${styles.editFieldInput} ${styles.editFieldTextarea}`}
              value={editingNode.refs}
              onChange={(e) => setEditingNode((prev) => prev ? { ...prev, refs: e.target.value } : null)}
              placeholder="e.g., Halmos, *Naive Set Theory*"
            />
          </div>

          <div className={styles.editField}>
            <label className={styles.editFieldLabel}>Topics</label>
            <textarea
              className={`${styles.editFieldInput} ${styles.editFieldTextarea}`}
              value={editingNode.topics}
              onChange={(e) => setEditingNode((prev) => prev ? { ...prev, topics: e.target.value } : null)}
              placeholder="e.g., ZFC axioms, ordinals, cardinals"
            />
          </div>

          <div className={styles.editField}>
            <label className={styles.editFieldLabel}>Badge</label>
            <input
              className={styles.editFieldInput}
              value={editingNode.badgeText}
              onChange={(e) => setEditingNode((prev) => prev ? { ...prev, badgeText: e.target.value } : null)}
              placeholder="e.g., NEW"
            />
          </div>

          <div className={styles.addNodeFormActions}>
            <button className={styles.formButton} onClick={() => setEditingNode(null)}>
              Cancel
            </button>
            <button
              className={`${styles.formButton} ${styles.formButtonPrimary}`}
              onClick={saveEditingNode}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className={styles.confirmOverlay} onClick={() => setConfirmDelete(null)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmMessage}>
              {confirmDelete.type === 'node'
                ? `Delete node "${spec.nodes.find((n) => n.id === confirmDelete.id)?.title ?? confirmDelete.id}" and all its connected edges?`
                : `Delete edge from "${spec.nodes.find((n) => n.id === confirmDelete.from)?.title ?? confirmDelete.from}" to "${spec.nodes.find((n) => n.id === confirmDelete.to)?.title ?? confirmDelete.to}"?`}
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.formButton} onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                className={`${styles.formButton} ${styles.toolbarButtonDanger}`}
                onClick={() => {
                  if (confirmDelete.type === 'node') handleDeleteNode(confirmDelete.id);
                  else handleDeleteEdge(confirmDelete.from, confirmDelete.to);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

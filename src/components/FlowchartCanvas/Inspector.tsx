import type { FlowchartNode, FlowchartStage } from '../../types/flowchart';
import styles from './Inspector.module.css';

const BADGE_STYLES = ['core', 'opt', 'frontier', 'default'];

export interface InspectorProps {
  node: FlowchartNode | null;
  stages: FlowchartStage[];
  /** Live-update the node while typing (no undo entry). */
  onLivePatch: (patch: Partial<FlowchartNode>) => void;
  /** Bracket a text-editing session for a single undo step. */
  onBeginEdit: () => void;
  onEndEdit: () => void;
  /** Discrete change recorded as its own undo step. */
  onCommitPatch: (patch: Partial<FlowchartNode>) => void;
  /** Rename the node's stable id (node_key). Warned as it breaks cross-app links. */
  onRenameId: (newId: string) => void;
  onDelete: () => void;
}

/**
 * Docked properties panel for the selected node. Replaces the old floating
 * double-click panel: it lives in a fixed sidebar so it never overlaps the
 * canvas, and edits preview live on the node.
 */
export function Inspector({ node, stages, onLivePatch, onBeginEdit, onEndEdit, onCommitPatch, onRenameId, onDelete }: InspectorProps) {
  if (!node) {
    return (
      <div className={styles.empty}>
        Select a node to edit its title, references, topics, stage, badge, and width.
      </div>
    );
  }

  const badgeText = node.badge?.text ?? '';
  const badgeStyle = node.badge?.style ?? 'default';

  const patchBadge = (text: string, style: string) => {
    if (!text.trim()) return { badge: undefined };
    return { badge: { ...node.badge, text, style } };
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.heading}>Node</span>
        <span className={styles.nodeId} title="Stable cross-app key (node_key)">#{node.id}</span>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Title</label>
        <input
          className={styles.input}
          value={node.title}
          onFocus={onBeginEdit}
          onBlur={onEndEdit}
          onChange={(e) => onLivePatch({ title: e.target.value })}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Stage</label>
          <select
            className={styles.select}
            value={node.stageKey}
            onChange={(e) => onCommitPatch({ stageKey: e.target.value })}
          >
            {stages.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.field} style={{ maxWidth: 84 }}>
          <label className={styles.label}>Width</label>
          <input
            className={styles.input}
            type="number"
            min={140}
            max={480}
            value={node.width}
            onChange={(e) => onCommitPatch({ width: Math.max(140, Math.min(480, Number(e.target.value) || 0)) })}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>References</label>
        <textarea
          className={styles.textarea}
          value={node.refs ?? ''}
          placeholder="e.g. *Rudin, Principles of Mathematical Analysis*"
          onFocus={onBeginEdit}
          onBlur={onEndEdit}
          onChange={(e) => onLivePatch({ refs: e.target.value || undefined })}
        />
        <span className={styles.hint}>Markdown *italic* and $LaTeX$ supported.</span>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Topics</label>
        <textarea
          className={styles.textarea}
          value={node.topics ?? ''}
          placeholder="Comma-separated key topics"
          onFocus={onBeginEdit}
          onBlur={onEndEdit}
          onChange={(e) => onLivePatch({ topics: e.target.value || undefined })}
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Badge text</label>
          <input
            className={styles.input}
            value={badgeText}
            placeholder="e.g. CORE"
            onFocus={onBeginEdit}
            onBlur={onEndEdit}
            onChange={(e) => onLivePatch(patchBadge(e.target.value, badgeStyle))}
          />
        </div>
        <div className={styles.field} style={{ maxWidth: 110 }}>
          <label className={styles.label}>Badge style</label>
          <select
            className={styles.select}
            value={badgeStyle}
            disabled={!badgeText.trim()}
            onChange={(e) => onCommitPatch(patchBadge(badgeText, e.target.value))}
          >
            {BADGE_STYLES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <details className={styles.field}>
        <summary className={styles.label} style={{ cursor: 'pointer' }}>Advanced</summary>
        <label className={styles.label} style={{ marginTop: 8 }}>Node ID (key)</label>
        <input
          key={node.id}
          className={styles.input}
          defaultValue={node.id}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== node.id) onRenameId(v);
          }}
        />
        <span className={styles.hint}>
          The stable cross-app key. Renaming it orphans any notes, attachments, or questions linked to the old key.
        </span>
      </details>

      <button className={styles.deleteBtn} onClick={onDelete}>Delete node</button>
    </div>
  );
}

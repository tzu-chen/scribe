import type { FlowchartSpec } from '../../types/flowchart';
import styles from './StageManager.module.css';

type ChartMeta = Partial<Pick<FlowchartSpec, 'title' | 'subtitle' | 'background' | 'width' | 'height'>>;

export interface StageManagerProps {
  spec: FlowchartSpec;
  nodeCountByStage: Record<string, number>;
  /** Group a text/color editing session into one undo step. */
  onBeginEdit: () => void;
  onEndEdit: () => void;
  onRenameStageLive: (key: string, label: string) => void;
  onRecolorStageLive: (key: string, accent: string) => void;
  onDeleteStage: (key: string) => void;
  onAddStage: () => void;
  onChartLive: (patch: ChartMeta) => void;
  onChartCommit: (patch: ChartMeta) => void;
}

/**
 * Sidebar panel for authoring the chart's stages and top-level settings.
 * Each stage's colour is a single accent that auto-derives the full 7-role
 * palette (generateStagePalette), so the user never hand-picks hex codes.
 */
export function StageManager({
  spec,
  nodeCountByStage,
  onBeginEdit,
  onEndEdit,
  onRenameStageLive,
  onRecolorStageLive,
  onDeleteStage,
  onAddStage,
  onChartLive,
  onChartCommit,
}: StageManagerProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <span className={styles.heading}>Chart</span>
        <div className={styles.field}>
          <label className={styles.label}>Title</label>
          <input
            className={styles.input}
            value={spec.title}
            onFocus={onBeginEdit}
            onBlur={onEndEdit}
            onChange={(e) => onChartLive({ title: e.target.value })}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Subtitle</label>
          <input
            className={styles.input}
            value={spec.subtitle ?? ''}
            onFocus={onBeginEdit}
            onBlur={onEndEdit}
            onChange={(e) => onChartLive({ subtitle: e.target.value || undefined })}
          />
        </div>
        <div className={styles.row}>
          <div className={styles.field} style={{ flex: 1 }}>
            <label className={styles.label}>Canvas W</label>
            <input
              className={styles.input}
              type="number"
              min={600}
              value={spec.width}
              onChange={(e) => onChartCommit({ width: Math.max(600, Number(e.target.value) || 0) })}
            />
          </div>
          <div className={styles.field} style={{ flex: 1 }}>
            <label className={styles.label}>Canvas H</label>
            <input
              className={styles.input}
              type="number"
              min={400}
              value={spec.height}
              onChange={(e) => onChartCommit({ height: Math.max(400, Number(e.target.value) || 0) })}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>BG</label>
            <input
              className={styles.swatch}
              type="color"
              value={spec.background ?? '#faf8f4'}
              onChange={(e) => onChartCommit({ background: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.heading}>Stages</span>
        </div>

        {spec.stages.map((stage) => {
          const count = nodeCountByStage[stage.key] ?? 0;
          return (
            <div key={stage.key} className={styles.stageRow}>
              <input
                className={styles.swatch}
                type="color"
                title="Stage accent — regenerates the palette"
                value={stage.colors.border}
                onFocus={onBeginEdit}
                onBlur={onEndEdit}
                onChange={(e) => onRecolorStageLive(stage.key, e.target.value)}
              />
              <input
                className={styles.stageLabelInput}
                value={stage.label}
                onFocus={onBeginEdit}
                onBlur={onEndEdit}
                onChange={(e) => onRenameStageLive(stage.key, e.target.value)}
              />
              <span className={styles.stageCount}>{count} node{count === 1 ? '' : 's'}</span>
              <button
                className={styles.iconBtn}
                title={count > 0 ? 'Move its nodes to another stage first' : 'Delete stage'}
                disabled={count > 0}
                onClick={() => onDeleteStage(stage.key)}
              >
                ✕
              </button>
            </div>
          );
        })}

        <button className={styles.addBtn} onClick={onAddStage}>+ Add stage</button>
      </div>
    </div>
  );
}

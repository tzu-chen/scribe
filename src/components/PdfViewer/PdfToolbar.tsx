import styles from './PdfToolbar.module.css';

const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];

interface Props {
  filename: string;
  currentPage: number;
  numPages: number;
  zoom: number;
  fitWidth: boolean;
  showToc: boolean;
  hasOutline: boolean;
  onZoomChange: (zoom: number) => void;
  onFitWidthToggle: () => void;
  onTocToggle: () => void;
  onReturnToFlowchart: () => void;
  onCreateNote: () => void;
}

export function PdfToolbar({
  filename,
  currentPage,
  numPages,
  zoom,
  fitWidth,
  showToc,
  hasOutline,
  onZoomChange,
  onFitWidthToggle,
  onTocToggle,
  onReturnToFlowchart,
  onCreateNote,
}: Props) {
  const zoomOut = () => {
    const current = zoom;
    for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
      if (ZOOM_STEPS[i] < current - 0.01) {
        onZoomChange(ZOOM_STEPS[i]);
        return;
      }
    }
  };

  const zoomIn = () => {
    const current = zoom;
    for (let i = 0; i < ZOOM_STEPS.length; i++) {
      if (ZOOM_STEPS[i] > current + 0.01) {
        onZoomChange(ZOOM_STEPS[i]);
        return;
      }
    }
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>
        <button className={styles.backBtn} onClick={onReturnToFlowchart}>
          &larr; Flowchart
        </button>
        <span className={styles.filename} title={filename}>
          {filename}
        </span>
      </div>

      <div className={styles.center}>
        <button className={styles.zoomBtn} onClick={zoomOut} title="Zoom out">
          &minus;
        </button>
        <span className={styles.zoomLevel}>{Math.round(zoom * 100)}%</span>
        <button className={styles.zoomBtn} onClick={zoomIn} title="Zoom in">
          +
        </button>
        <button
          className={`${styles.fitBtn} ${fitWidth ? styles.fitBtnActive : ''}`}
          onClick={onFitWidthToggle}
          title="Fit page width"
        >
          Fit Width
        </button>
        <span className={styles.divider} />
        <span className={styles.pageInfo}>
          {currentPage} / {numPages}
        </span>
        {hasOutline && (
          <>
            <span className={styles.divider} />
            <button
              className={`${styles.tocBtn} ${showToc ? styles.tocBtnActive : ''}`}
              onClick={onTocToggle}
              title="Table of contents"
            >
              TOC
            </button>
          </>
        )}
      </div>

      <div className={styles.right}>
        <button className={styles.noteBtn} onClick={onCreateNote}>
          + Create Note
        </button>
      </div>
    </div>
  );
}

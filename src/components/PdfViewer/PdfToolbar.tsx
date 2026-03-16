import { useState, useRef, useEffect } from 'react';
import styles from './PdfToolbar.module.css';

const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];

interface Props {
  filename: string;
  currentPage: number;
  numPages: number;
  onPageJump: (page: number) => void;
  zoom: number;
  fitWidth: boolean;
  showToc: boolean;
  hasOutline: boolean;
  twoPageView: boolean;
  onZoomChange: (zoom: number) => void;
  onFitWidthToggle: () => void;
  onTwoPageViewToggle: () => void;
  onTocToggle: () => void;
  showRightPanel: boolean;
  onRightPanelToggle: () => void;
  onReturnToFlowchart: () => void;
  onCreateNote: () => void;
  onOpenInNewTab: () => void;
}

export function PdfToolbar({
  filename,
  currentPage,
  numPages,
  onPageJump,
  zoom,
  fitWidth,
  showToc,
  hasOutline,
  twoPageView,
  onZoomChange,
  onFitWidthToggle,
  onTwoPageViewToggle,
  onTocToggle,
  showRightPanel,
  onRightPanelToggle,
  onReturnToFlowchart,
  onCreateNote,
  onOpenInNewTab,
}: Props) {
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const pageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingPage) {
      pageInputRef.current?.select();
    }
  }, [editingPage]);

  const commitPageJump = () => {
    const page = parseInt(pageInput, 10);
    if (!isNaN(page) && page >= 1 && page <= numPages) {
      onPageJump(page);
    }
    setEditingPage(false);
  };

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
        <button
          className={`${styles.twoPageBtn} ${twoPageView ? styles.twoPageBtnActive : ''}`}
          onClick={onTwoPageViewToggle}
          title="Two-page view"
        >
          2-Page
        </button>
        <span className={styles.divider} />
        <button
          className={styles.pageNavBtn}
          onClick={() => onPageJump(currentPage - 1)}
          disabled={currentPage <= 1}
          title="Previous page"
        >
          &lsaquo;
        </button>
        {editingPage ? (
          <span className={styles.pageInfo}>
            <input
              ref={pageInputRef}
              className={styles.pageInput}
              type="text"
              inputMode="numeric"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitPageJump();
                if (e.key === 'Escape') setEditingPage(false);
              }}
              onBlur={commitPageJump}
            />
            <span>/ {numPages}</span>
          </span>
        ) : (
          <span
            className={`${styles.pageInfo} ${styles.pageInfoClickable}`}
            onClick={() => { setPageInput(String(currentPage)); setEditingPage(true); }}
            title="Click to jump to a page"
          >
            {currentPage} / {numPages}
          </span>
        )}
        <button
          className={styles.pageNavBtn}
          onClick={() => onPageJump(currentPage + 1)}
          disabled={currentPage >= numPages}
          title="Next page"
        >
          &rsaquo;
        </button>
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
        <button
          className={styles.newTabBtn}
          onClick={onOpenInNewTab}
          title="Open in new tab"
        >
          &#8599;
        </button>
        <button
          className={`${styles.panelBtn} ${showRightPanel ? styles.panelBtnActive : ''}`}
          onClick={onRightPanelToggle}
          title="Comments & Notes panel"
        >
          Panel
        </button>
        <button className={styles.noteBtn} onClick={onCreateNote}>
          + Create Note
        </button>
      </div>
    </div>
  );
}

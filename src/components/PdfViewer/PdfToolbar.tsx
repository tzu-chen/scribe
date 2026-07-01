import { useState, useRef, useEffect } from 'react';
import { MinusIcon, PlusIcon, ChevronLeftIcon, ChevronRightIcon, FitWidthIcon, TwoPageIcon, CropIcon, DownloadIcon, OrientationLockIcon, FlowchartIcon } from '../Icons/Icons';
import { stripExtension } from '../../utils/filename';
import type { NodeAttachmentLink } from '../../types/attachment';
import styles from './PdfToolbar.module.css';

const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];

const IS_TOUCH = typeof window !== 'undefined'
  && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

interface Props {
  filename: string;
  nodeLinks?: NodeAttachmentLink[];
  onOpenNode?: (link: NodeAttachmentLink) => void;
  currentPage: number;
  numPages: number;
  onPageJump: (page: number) => void;
  zoom: number;
  fitWidth: boolean;
  twoPageView: boolean;
  onZoomChange: (zoom: number) => void;
  onFitWidthToggle: () => void;
  onTwoPageViewToggle: () => void;
  immersiveMode?: boolean;
  cropActive?: boolean;
  onCropToggle?: () => void;
  onExportCropped?: () => void;
  exportingCropped?: boolean;
  orientationLocked?: boolean;
  onOrientationLockToggle?: () => void;
  fileType?: 'pdf' | 'djvu';
}

export function PdfToolbar({
  filename,
  nodeLinks = [],
  onOpenNode,
  currentPage,
  numPages,
  onPageJump,
  zoom,
  fitWidth,
  twoPageView,
  onZoomChange,
  onFitWidthToggle,
  onTwoPageViewToggle,
  immersiveMode,
  cropActive,
  onCropToggle,
  onExportCropped,
  exportingCropped,
  orientationLocked,
  onOrientationLockToggle,
  fileType,
}: Props) {
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const pageInputRef = useRef<HTMLInputElement>(null);

  const [editingZoom, setEditingZoom] = useState(false);
  const [zoomInput, setZoomInput] = useState('');
  const zoomInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingPage) {
      pageInputRef.current?.select();
    }
  }, [editingPage]);

  useEffect(() => {
    if (editingZoom) {
      zoomInputRef.current?.select();
    }
  }, [editingZoom]);

  const commitPageJump = () => {
    const page = parseInt(pageInput, 10);
    if (!isNaN(page) && page >= 1 && page <= numPages) {
      onPageJump(page);
    }
    setEditingPage(false);
  };

  const commitZoom = () => {
    const value = parseInt(zoomInput, 10);
    if (!isNaN(value)) {
      const clamped = Math.min(1000, Math.max(50, value));
      onZoomChange(clamped / 100);
    }
    setEditingZoom(false);
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

  if (immersiveMode) return null;

  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>
        <div className={styles.titleGroup}>
          <span className={styles.filename} title={stripExtension(filename)}>
            {stripExtension(filename)}
          </span>
          {nodeLinks.length > 0 && (
            <span
              className={styles.nodeIndicator}
              aria-label={`In ${nodeLinks.length} flowchart node${nodeLinks.length === 1 ? '' : 's'}`}
            >
              <FlowchartIcon size={13} />
              {nodeLinks.length}
            </span>
          )}
          {nodeLinks.length > 0 && (
            <div className={styles.nodeTooltip} role="tooltip">
              <div className={styles.nodeTooltipHeader}>
                In {nodeLinks.length} flowchart node{nodeLinks.length === 1 ? '' : 's'}
              </div>
              {nodeLinks.map((link) => (
                <button
                  key={`${link.flowchartId}:${link.nodeKey}`}
                  type="button"
                  className={styles.nodeTooltipRow}
                  onClick={() => onOpenNode?.(link)}
                  title={`Open ${link.flowchartName}`}
                >
                  <span className={styles.nodeTooltipNode}>{link.title}</span>
                  <span className={styles.nodeTooltipFlowchart}>{link.flowchartName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className={styles.formatBadge}>
          {fileType === 'djvu' ? 'DJVU' : 'PDF'}
        </span>
      </div>

      <div className={styles.center}>
        <button className={styles.zoomBtn} onClick={zoomOut} title="Zoom out">
          <MinusIcon size={16} />
        </button>
        {editingZoom ? (
          <input
            ref={zoomInputRef}
            className={styles.zoomInput}
            type="text"
            inputMode="numeric"
            value={zoomInput}
            onChange={(e) => setZoomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitZoom();
              if (e.key === 'Escape') setEditingZoom(false);
            }}
            onBlur={commitZoom}
          />
        ) : (
          <span
            className={`${styles.zoomLevel} ${styles.zoomLevelClickable}`}
            onClick={() => { setZoomInput(String(Math.round(zoom * 100))); setEditingZoom(true); }}
            title="Click to set zoom level"
          >
            {Math.round(zoom * 100)}%
          </span>
        )}
        <button className={styles.zoomBtn} onClick={zoomIn} title="Zoom in">
          <PlusIcon size={16} />
        </button>
        <button
          className={`${styles.iconBtn} ${fitWidth ? styles.iconBtnActive : ''}`}
          onClick={onFitWidthToggle}
          title="Fit page width"
        >
          <FitWidthIcon size={16} />
        </button>
        <button
          className={`${styles.iconBtn} ${twoPageView ? styles.iconBtnActive : ''}`}
          onClick={onTwoPageViewToggle}
          title="Two-page view"
        >
          <TwoPageIcon size={16} />
        </button>
        <button
          className={`${styles.iconBtn} ${cropActive ? styles.iconBtnActive : ''}`}
          onClick={onCropToggle}
          title={cropActive ? 'Edit crop (crop is active)' : 'Crop pages'}
        >
          <CropIcon size={16} />
        </button>
        {onExportCropped && fileType !== 'djvu' && (
          <button
            className={styles.iconBtn}
            onClick={onExportCropped}
            disabled={exportingCropped}
            title={cropActive ? 'Export PDF with current crop applied' : 'Export PDF'}
          >
            <DownloadIcon size={16} />
          </button>
        )}
        {IS_TOUCH && onOrientationLockToggle && (
          <button
            className={`${styles.iconBtn} ${orientationLocked ? styles.iconBtnActive : ''}`}
            onClick={onOrientationLockToggle}
            title={orientationLocked ? 'Unlock orientation' : 'Lock current orientation'}
          >
            <OrientationLockIcon size={16} />
          </button>
        )}
        <span className={styles.divider} />
        <button
          className={styles.pageNavBtn}
          onClick={() => onPageJump(twoPageView ? (currentPage <= 2 ? 1 : currentPage - 2) : currentPage - 1)}
          disabled={currentPage <= 1}
          title="Previous page"
        >
          <ChevronLeftIcon size={18} />
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
          onClick={() => onPageJump(twoPageView ? (currentPage === 1 ? 2 : currentPage + 2) : currentPage + 1)}
          disabled={twoPageView ? (currentPage === 1 ? numPages < 2 : currentPage + 2 > numPages) : currentPage >= numPages}
          title="Next page"
        >
          <ChevronRightIcon size={18} />
        </button>
      </div>

      <div className={styles.right} />
    </div>
  );
}

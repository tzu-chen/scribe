import { useState, useRef, useCallback, useEffect } from 'react';
import type { CropBox } from '../../types/crop';
import { hasCrop } from '../../types/crop';
import styles from './PdfCropOverlay.module.css';

interface Props {
  pageWidth: number;
  pageHeight: number;
  currentCrop: CropBox;
  onApply: (crop: CropBox) => void;
  onReset: () => void;
  onCancel: () => void;
}

type DragEdge = 'top' | 'right' | 'bottom' | 'left' | null;

const MAX_CROP = 0.45; // Each edge can crop at most 45%

export function PdfCropOverlay({
  pageWidth,
  pageHeight,
  currentCrop,
  onApply,
  onReset,
  onCancel,
}: Props) {
  const [crop, setCrop] = useState<CropBox>({ ...currentCrop });
  const [dragging, setDragging] = useState<DragEdge>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // Calculate preview size to fit within viewport
  const aspect = pageWidth / pageHeight;
  const maxW = Math.min(500, window.innerWidth * 0.7);
  const maxH = window.innerHeight * 0.6;
  let previewW: number;
  let previewH: number;
  if (maxW / aspect <= maxH) {
    previewW = maxW;
    previewH = maxW / aspect;
  } else {
    previewH = maxH;
    previewW = maxH * aspect;
  }

  const handlePointerDown = useCallback((edge: DragEdge) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(edge);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();

    setCrop(prev => {
      const next = { ...prev };
      if (dragging === 'top') {
        const frac = Math.max(0, Math.min(MAX_CROP, (e.clientY - rect.top) / rect.height));
        next.top = frac;
      } else if (dragging === 'bottom') {
        const frac = Math.max(0, Math.min(MAX_CROP, (rect.bottom - e.clientY) / rect.height));
        next.bottom = frac;
      } else if (dragging === 'left') {
        const frac = Math.max(0, Math.min(MAX_CROP, (e.clientX - rect.left) / rect.width));
        next.left = frac;
      } else if (dragging === 'right') {
        const frac = Math.max(0, Math.min(MAX_CROP, (rect.right - e.clientX) / rect.width));
        next.right = frac;
      }
      return next;
    });
  }, [dragging]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Escape key cancels
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // Crop area in pixels within the preview
  const cropTopPx = crop.top * previewH;
  const cropBottomPx = crop.bottom * previewH;
  const cropLeftPx = crop.left * previewW;
  const cropRightPx = crop.right * previewW;
  const cropAreaTop = cropTopPx;
  const cropAreaLeft = cropLeftPx;
  const cropAreaWidth = previewW - cropLeftPx - cropRightPx;
  const cropAreaHeight = previewH - cropTopPx - cropBottomPx;

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.content} onClick={e => e.stopPropagation()}>
        <div className={styles.hint}>
          Drag the edges to set the crop area. Applies to all pages.
        </div>
        <div
          ref={pageRef}
          className={styles.pageContainer}
          style={{ width: previewW, height: previewH }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Dim regions */}
          <div className={styles.dimTop} style={{ height: cropTopPx }} />
          <div className={styles.dimBottom} style={{ height: cropBottomPx }} />
          <div
            className={styles.dimLeft}
            style={{
              top: cropTopPx,
              width: cropLeftPx,
              height: cropAreaHeight,
            }}
          />
          <div
            className={styles.dimRight}
            style={{
              top: cropTopPx,
              width: cropRightPx,
              height: cropAreaHeight,
            }}
          />

          {/* Crop area outline */}
          <div
            className={styles.cropArea}
            style={{
              top: cropAreaTop,
              left: cropAreaLeft,
              width: cropAreaWidth,
              height: cropAreaHeight,
            }}
          />

          {/* Draggable edge handles — positioned on the crop area edges */}
          <div
            className={`${styles.handle} ${styles.handleTop}`}
            style={{ top: cropAreaTop - 6 }}
            onPointerDown={handlePointerDown('top')}
          >
            <div className={styles.handleBar} />
          </div>
          <div
            className={`${styles.handle} ${styles.handleBottom}`}
            style={{ bottom: previewH - cropAreaTop - cropAreaHeight - 6 }}
            onPointerDown={handlePointerDown('bottom')}
          >
            <div className={styles.handleBar} />
          </div>
          <div
            className={`${styles.handle} ${styles.handleLeft}`}
            style={{ left: cropAreaLeft - 6 }}
            onPointerDown={handlePointerDown('left')}
          >
            <div className={styles.handleBar} />
          </div>
          <div
            className={`${styles.handle} ${styles.handleRight}`}
            style={{ right: previewW - cropAreaLeft - cropAreaWidth - 6 }}
            onPointerDown={handlePointerDown('right')}
          >
            <div className={styles.handleBar} />
          </div>
        </div>

        <div className={styles.controls}>
          <button className={styles.applyBtn} onClick={() => onApply(crop)}>
            Apply to All Pages
          </button>
          {hasCrop(currentCrop) && (
            <button className={styles.resetBtn} onClick={onReset}>
              Reset
            </button>
          )}
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

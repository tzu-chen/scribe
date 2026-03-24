import { useState, useRef, useCallback, useEffect } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { CropBox } from '../../types/crop';
import { hasCrop } from '../../types/crop';
import styles from './PdfCropOverlay.module.css';

interface Props {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  currentCrop: CropBox;
  onApply: (crop: CropBox) => void;
  onReset: () => void;
  onCancel: () => void;
}

type DragEdge = 'top' | 'right' | 'bottom' | 'left' | null;

const MAX_CROP = 0.45;

export function PdfCropOverlay({
  pdfDoc,
  pageNumber,
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  // Calculate preview size — fit the ENTIRE page within the viewport,
  // leaving room for the hint text and control buttons (~100px).
  const aspect = pageWidth / pageHeight;
  const maxW = window.innerWidth * 0.85;
  const maxH = window.innerHeight - 120;
  let previewW: number;
  let previewH: number;
  // Always constrain by whichever dimension is tighter
  if (maxW / aspect <= maxH) {
    previewW = maxW;
    previewH = maxW / aspect;
  } else {
    previewH = maxH;
    previewW = maxH * aspect;
  }

  // Render the actual PDF page to the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    const renderPage = async () => {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;

      const scale = previewW / pageWidth;
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale });
      const renderViewport = page.getViewport({ scale: scale * dpr });

      canvas.width = Math.floor(renderViewport.width);
      canvas.height = Math.floor(renderViewport.height);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      renderTaskRef.current?.cancel();
      const renderTask = page.render({ canvas, viewport: renderViewport });
      renderTaskRef.current = renderTask;

      try {
        await renderTask.promise;
      } catch (err) {
        if (err instanceof Error && err.name === 'RenderingCancelledException') return;
      }
    };

    renderPage();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdfDoc, pageNumber, pageWidth, previewW]);

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
        next.top = Math.max(0, Math.min(MAX_CROP, (e.clientY - rect.top) / rect.height));
      } else if (dragging === 'bottom') {
        next.bottom = Math.max(0, Math.min(MAX_CROP, (rect.bottom - e.clientY) / rect.height));
      } else if (dragging === 'left') {
        next.left = Math.max(0, Math.min(MAX_CROP, (e.clientX - rect.left) / rect.width));
      } else if (dragging === 'right') {
        next.right = Math.max(0, Math.min(MAX_CROP, (rect.right - e.clientX) / rect.width));
      }
      return next;
    });
  }, [dragging]);

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

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
          {/* Actual PDF page rendered to canvas */}
          <canvas ref={canvasRef} className={styles.pageCanvas} />

          {/* Dim regions over cropped-away areas */}
          <div className={styles.dimTop} style={{ height: cropTopPx }} />
          <div className={styles.dimBottom} style={{ height: cropBottomPx }} />
          <div
            className={styles.dimLeft}
            style={{ top: cropTopPx, width: cropLeftPx, height: cropAreaHeight }}
          />
          <div
            className={styles.dimRight}
            style={{ top: cropTopPx, width: cropRightPx, height: cropAreaHeight }}
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

          {/* Draggable edge handles */}
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

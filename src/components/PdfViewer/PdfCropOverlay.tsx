import { useState, useRef, useCallback, useEffect } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { CropBox } from '../../types/crop';
import { hasCrop } from '../../types/crop';
import { createTrimCanvas, detectPdfPageCrop } from '../../utils/autoTrim';
import styles from './PdfCropOverlay.module.css';

interface Props {
  pdfDoc: PDFDocumentProxy;
  /** Page the viewer was on when the overlay opened — used to pick a sensible sample page for each parity. */
  pageNumber: number;
  numPages: number;
  pageWidth: number;
  pageHeight: number;
  currentCropOdd: CropBox;
  currentCropEven: CropBox;
  onApply: (cropOdd: CropBox, cropEven: CropBox) => void;
  onReset: () => void;
  onCancel: () => void;
}

type DragEdge = 'top' | 'right' | 'bottom' | 'left' | null;
type Parity = 'odd' | 'even';

const MAX_CROP = 0.45;

function sampleFor(parity: Parity, currentPage: number, numPages: number): number {
  if (parity === 'odd') {
    if (currentPage % 2 === 1) return currentPage;
    if (currentPage > 1) return currentPage - 1;
    return Math.min(numPages, currentPage + 1);
  }
  if (currentPage % 2 === 0) return currentPage;
  if (currentPage < numPages) return currentPage + 1;
  return Math.max(1, currentPage - 1);
}

export function PdfCropOverlay({
  pdfDoc,
  pageNumber,
  numPages,
  pageWidth,
  pageHeight,
  currentCropOdd,
  currentCropEven,
  onApply,
  onReset,
  onCancel,
}: Props) {
  const [cropOdd, setCropOdd] = useState<CropBox>({ ...currentCropOdd });
  const [cropEven, setCropEven] = useState<CropBox>({ ...currentCropEven });
  const [parity, setParity] = useState<Parity>(pageNumber % 2 === 1 ? 'odd' : 'even');
  const [dragging, setDragging] = useState<DragEdge>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const crop = parity === 'odd' ? cropOdd : cropEven;
  const setCrop = parity === 'odd' ? setCropOdd : setCropEven;
  const samplePage = sampleFor(parity, pageNumber, numPages);

  // Calculate preview size — fit the ENTIRE page within the viewport,
  // leaving room for the hint text, tab bar, and control buttons (~160px).
  const aspect = pageWidth / pageHeight;
  const maxW = window.innerWidth * 0.85;
  const maxH = window.innerHeight - 180;
  let previewW: number;
  let previewH: number;
  if (maxW / aspect <= maxH) {
    previewW = maxW;
    previewH = maxW / aspect;
  } else {
    previewH = maxH;
    previewW = maxH * aspect;
  }

  // Render the actual PDF page to the canvas. Re-renders whenever the sample
  // page changes (parity toggle) so the user sees real content for that side.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    const renderPage = async () => {
      const page = await pdfDoc.getPage(samplePage);
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
  }, [pdfDoc, samplePage, pageWidth, previewW]);

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
  }, [dragging, setCrop]);

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

  // Seed the manual box from the same detector auto-trim uses, measured on the
  // page currently shown. Gives a starting point to nudge instead of dragging
  // all four edges from scratch.
  const [detecting, setDetecting] = useState(false);
  const handleAutoDetect = useCallback(async () => {
    setDetecting(true);
    try {
      const detected = await detectPdfPageCrop(pdfDoc, samplePage, createTrimCanvas());
      if (detected) setCrop(detected);
    } catch (err) {
      console.error('Auto-detect failed:', err);
    } finally {
      setDetecting(false);
    }
  }, [pdfDoc, samplePage, setCrop]);

  const handleApplyToAll = () => {
    // Copy the currently-edited parity's crop to both sides.
    onApply(crop, crop);
  };

  const handleApply = () => {
    onApply(cropOdd, cropEven);
  };

  const cropTopPx = crop.top * previewH;
  const cropBottomPx = crop.bottom * previewH;
  const cropLeftPx = crop.left * previewW;
  const cropRightPx = crop.right * previewW;
  const cropAreaTop = cropTopPx;
  const cropAreaLeft = cropLeftPx;
  const cropAreaWidth = previewW - cropLeftPx - cropRightPx;
  const cropAreaHeight = previewH - cropTopPx - cropBottomPx;

  const anyCurrentCrop = hasCrop(currentCropOdd) || hasCrop(currentCropEven);

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.content} onClick={e => e.stopPropagation()}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${parity === 'odd' ? styles.tabActive : ''}`}
            onClick={() => setParity('odd')}
          >
            Odd pages
          </button>
          <button
            className={`${styles.tab} ${parity === 'even' ? styles.tabActive : ''}`}
            onClick={() => setParity('even')}
          >
            Even pages
          </button>
        </div>
        <div className={styles.hint}>
          Drag the edges to set the crop for {parity} pages (page {samplePage} shown).
        </div>
        <div
          ref={pageRef}
          className={styles.pageContainer}
          style={{ width: previewW, height: previewH }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <canvas ref={canvasRef} className={styles.pageCanvas} />

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

          <div
            className={styles.cropArea}
            style={{
              top: cropAreaTop,
              left: cropAreaLeft,
              width: cropAreaWidth,
              height: cropAreaHeight,
            }}
          />

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
          <button
            className={styles.detectBtn}
            onClick={handleAutoDetect}
            disabled={detecting}
            title={`Detect the margins of page ${samplePage}`}
          >
            {detecting ? 'Detecting…' : 'Auto-detect'}
          </button>
          <button className={styles.applyBtn} onClick={handleApply}>
            Apply
          </button>
          <button className={styles.applyAllBtn} onClick={handleApplyToAll}>
            Apply to All Pages
          </button>
          {anyCurrentCrop && (
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

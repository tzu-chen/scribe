import { useState, useEffect, useRef, useCallback } from 'react';
import { TextLayer, setLayerDimensions } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfHighlight, HighlightRect } from '../../types/annotation';
import type { CropBox } from '../../types/crop';
import { PdfHighlightLayer } from './PdfHighlightLayer';
import { filterTinyRects, mergeRectsOnSameLine } from './rectUtils';
import styles from './PdfPageView.module.css';

export interface TextSelection {
  text: string;
  rects: HighlightRect[];
  pageNumber: number;
  anchorPosition: { x: number; y: number };
}

interface Props {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  expectedWidth: number;
  expectedHeight: number;
  highlights: PdfHighlight[];
  crop?: CropBox;
  onTextSelected: (selection: TextSelection) => void;
  onSelectionCleared: () => void;
  onHighlightClick: (highlightId: string, anchorRect: DOMRect) => void;
}

export function PdfPageView({
  pdfDoc,
  pageNumber,
  scale,
  expectedWidth,
  expectedHeight,
  highlights,
  crop,
  onTextSelected,
  onSelectionCleared,
  onHighlightClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageContentRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const textLayerInstanceRef = useRef<TextLayer | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: Math.floor(expectedWidth * scale),
    height: Math.floor(expectedHeight * scale),
  });
  useEffect(() => {
    let cancelled = false;

    const renderPage = async () => {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;

      const dpr = window.devicePixelRatio || 1;
      // CSS-size viewport (for display dimensions and text layer)
      const viewport = page.getViewport({ scale });
      // High-res viewport for sharp canvas rendering on HiDPI displays
      const renderViewport = page.getViewport({ scale: scale * dpr });

      const canvas = canvasRef.current;
      const textLayerDiv = textLayerRef.current;
      if (!canvas || !textLayerDiv) return;

      // Set actual canvas pixel dimensions (high-res for sharp rendering)
      canvas.width = Math.floor(renderViewport.width);
      canvas.height = Math.floor(renderViewport.height);

      // Set CSS display dimensions (normal-res)
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const dims = {
        width: Math.floor(viewport.width),
        height: Math.floor(viewport.height),
      };
      setDimensions(dims);

      // Cancel previous render
      renderTaskRef.current?.cancel();

      // Render at high-res viewport so canvas pixels are fully utilized
      const renderTask = page.render({ canvas, viewport: renderViewport });
      renderTaskRef.current = renderTask;

      try {
        await renderTask.promise;
      } catch (err) {
        // Only return silently on cancellation; log real errors
        if (err instanceof Error && err.name === 'RenderingCancelledException') {
          return;
        }
        console.error(`Failed to render page ${pageNumber}:`, err);
        return;
      }

      if (cancelled) return;

      // Cancel previous text layer
      textLayerInstanceRef.current?.cancel();

      // Clear and size the text layer div using the CSS-size viewport
      textLayerDiv.innerHTML = '';
      setLayerDimensions(textLayerDiv, viewport);

      const textContent = await page.getTextContent();
      if (cancelled) return;

      const textLayer = new TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
      });
      textLayerInstanceRef.current = textLayer;

      try {
        await textLayer.render();
      } catch {
        // Text layer render can fail on some PDFs; canvas still works
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      textLayerInstanceRef.current?.cancel();
    };
  }, [pdfDoc, pageNumber, scale]);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      onSelectionCleared();
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // Check that selection is within this page
    const range = selection.getRangeAt(0);
    if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
      return;
    }

    const text = selection.toString().trim();
    // Use the full-page content div for coordinate calculations so highlight
    // rects stay normalized to the full (uncropped) page dimensions.
    const coordEl = pageContentRef.current ?? container;
    const pageRect = coordEl.getBoundingClientRect();
    const pw = pageRect.width;
    const ph = pageRect.height;

    if (pw === 0 || ph === 0) return;

    const clientRects = range.getClientRects();
    const rawRects: HighlightRect[] = [];
    for (let i = 0; i < clientRects.length; i++) {
      const cr = clientRects[i];
      rawRects.push({
        x: (cr.left - pageRect.left) / pw,
        y: (cr.top - pageRect.top) / ph,
        width: cr.width / pw,
        height: cr.height / ph,
      });
    }

    // Filter out tiny artifact rects and merge overlapping same-line rects
    // produced by per-span getClientRects().
    const rects = mergeRectsOnSameLine(filterTinyRects(rawRects));

    if (rects.length === 0) return;

    // Position toolbar above the first rect
    const firstRect = clientRects[0];
    onTextSelected({
      text,
      rects,
      pageNumber,
      anchorPosition: {
        x: firstRect.left + firstRect.width / 2,
        y: firstRect.top,
      },
    });
  }, [pageNumber, onTextSelected, onSelectionCleared]);

  const pageHighlights = highlights.filter(h => h.pageNumber === pageNumber);

  const cropT = crop?.top ?? 0;
  const cropR = crop?.right ?? 0;
  const cropB = crop?.bottom ?? 0;
  const cropL = crop?.left ?? 0;
  const isCropped = cropT > 0 || cropR > 0 || cropB > 0 || cropL > 0;

  const fullW = Math.floor(expectedWidth * scale);
  const fullH = Math.floor(expectedHeight * scale);
  const croppedW = isCropped ? Math.floor(expectedWidth * (1 - cropL - cropR) * scale) : fullW;
  const croppedH = isCropped ? Math.floor(expectedHeight * (1 - cropT - cropB) * scale) : fullH;

  return (
    <div
      ref={containerRef}
      className={styles.page}
      style={{
        width: croppedW,
        height: croppedH,
      }}
      onMouseUp={handleMouseUp}
    >
      <div
        ref={pageContentRef}
        style={{
          position: 'relative',
          width: fullW,
          height: fullH,
          // pdfjs-dist text layer CSS expects these variables on an ancestor;
          // normally set by .pdfViewer .page which we don't use.
          '--scale-factor': `${scale}`,
          '--total-scale-factor': `${scale}`,
          '--scale-round-x': '1px',
          '--scale-round-y': '1px',
          ...(isCropped ? {
            marginLeft: -Math.floor(cropL * expectedWidth * scale),
            marginTop: -Math.floor(cropT * expectedHeight * scale),
          } : undefined),
        } as React.CSSProperties}
      >
        <canvas ref={canvasRef} className={styles.canvas} />
        {/* Use unscoped "textLayer" class so pdfjs-dist/web/pdf_viewer.css applies */}
        <div ref={textLayerRef} className="textLayer" />
        <PdfHighlightLayer
          highlights={pageHighlights}
          pageWidth={dimensions.width}
          pageHeight={dimensions.height}
          onHighlightClick={onHighlightClick}
        />
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfHighlight, HighlightRect } from '../../types/annotation';
import { PdfHighlightLayer } from './PdfHighlightLayer';
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
  highlights: PdfHighlight[];
  onTextSelected: (selection: TextSelection) => void;
  onSelectionCleared: () => void;
  onHighlightClick: (highlightId: string, anchorRect: DOMRect) => void;
}

export function PdfPageView({
  pdfDoc,
  pageNumber,
  scale,
  highlights,
  onTextSelected,
  onSelectionCleared,
  onHighlightClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const textLayerInstanceRef = useRef<TextLayer | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  // Keep a ref copy so the mouseup handler doesn't need dimensions as a dep
  const dimensionsRef = useRef(dimensions);
  useEffect(() => {
    dimensionsRef.current = dimensions;
  }, [dimensions]);

  useEffect(() => {
    let cancelled = false;

    const renderPage = async () => {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const textLayerDiv = textLayerRef.current;
      if (!canvas || !textLayerDiv) return;

      // Set canvas CSS dimensions to match the viewport
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const dims = {
        width: Math.floor(viewport.width),
        height: Math.floor(viewport.height),
      };
      setDimensions(dims);

      // Cancel previous render
      renderTaskRef.current?.cancel();

      const renderTask = page.render({ canvas, viewport });
      renderTaskRef.current = renderTask;

      try {
        await renderTask.promise;
      } catch {
        // Render cancelled
        return;
      }

      if (cancelled) return;

      // Cancel previous text layer
      textLayerInstanceRef.current?.cancel();

      // Clear text layer
      textLayerDiv.innerHTML = '';
      textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
      textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;

      const textContent = await page.getTextContent();
      if (cancelled) return;

      const textLayer = new TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
      });
      textLayerInstanceRef.current = textLayer;
      await textLayer.render();
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
    const pageRect = container.getBoundingClientRect();
    const { width: pageWidth, height: pageHeight } = dimensionsRef.current;

    if (pageWidth === 0 || pageHeight === 0) return;

    const clientRects = range.getClientRects();
    const rects: HighlightRect[] = [];
    for (let i = 0; i < clientRects.length; i++) {
      const cr = clientRects[i];
      rects.push({
        x: (cr.left - pageRect.left) / pageWidth,
        y: (cr.top - pageRect.top) / pageHeight,
        width: cr.width / pageWidth,
        height: cr.height / pageHeight,
      });
    }

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

  return (
    <div
      ref={containerRef}
      className={styles.page}
      data-page-number={pageNumber}
      onMouseUp={handleMouseUp}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      <div ref={textLayerRef} className={styles.textLayer} />
      <PdfHighlightLayer
        highlights={pageHighlights}
        pageWidth={dimensions.width}
        pageHeight={dimensions.height}
        onHighlightClick={onHighlightClick}
      />
    </div>
  );
}

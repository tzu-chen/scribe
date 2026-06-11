import { useState, useEffect, useRef, useCallback } from 'react';
import { TextLayer, setLayerDimensions } from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { PdfHighlight, HighlightRect } from '../../types/annotation';
import type { CropBox } from '../../types/crop';
import { PdfHighlightLayer } from './PdfHighlightLayer';
import { filterTinyRects, mergeRectsOnSameLine } from './rectUtils';
import styles from './PdfPageView.module.css';

// Mobile momentum scrolls last 500–1500 ms; a 50 ms debounce almost never
// coalesces mid-flick. Bumping to 180 ms on touch devices collapses multiple
// transient mounts into one render and reduces canvas/heap churn.
const IS_TOUCH = typeof window !== 'undefined'
  && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
const RENDER_DEBOUNCE_MS = IS_TOUCH ? 180 : 50;

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
  /** When true, skip the render debounce for immediate display (e.g. deliberate navigation). */
  priority?: boolean;
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
  priority,
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
  // Hold the PDFPageProxy so cleanup can release its cached operator list,
  // fonts, and intent state. Without this, every page visited during a fast
  // scroll permanently inflates the document's retained heap.
  const pageRef = useRef<PDFPageProxy | null>(null);
  // Capture priority at mount time so the render effect can read it without
  // adding it to the dependency array (avoids re-triggering renders).
  const priorityRef = useRef(priority);
  priorityRef.current = priority;
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: Math.floor(expectedWidth * scale),
    height: Math.floor(expectedHeight * scale),
  });
  useEffect(() => {
    let cancelled = false;

    const renderPage = async () => {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) {
        // Component unmounted mid-await; release the page we just primed
        // so it doesn't leak into the document's retained heap.
        page.cleanup();
        return;
      }
      pageRef.current = page;

      // Cap DPR to 2 to limit canvas memory on 3x displays (iPad Pro)
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // CSS-size viewport (for display dimensions and text layer)
      const viewport = page.getViewport({ scale });
      // High-res viewport for sharp canvas rendering on HiDPI displays
      const renderViewport = page.getViewport({ scale: scale * dpr });

      const canvas = canvasRef.current;
      const textLayerDiv = textLayerRef.current;
      if (!canvas || !textLayerDiv) return;

      // Release old backing buffer before allocating new one to prevent
      // transient double-allocation that exhausts WebKit canvas memory.
      canvas.width = 0;
      canvas.height = 0;

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
        // Cancellation is routine: it only happens when a successor render (or
        // unmount) is on the way, so the canvas won't stay blank. Real errors
        // propagate to the caller, which logs and retries — abandoning them
        // here would leave a permanently blank page.
        if (err instanceof Error && err.name === 'RenderingCancelledException') {
          return;
        }
        throw err;
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

    // Any rejection here (getPage failure, a synchronous page.render() throw,
    // or a real render error rethrown above) would otherwise leave the canvas
    // blank with nothing scheduled to repaint it. Log and retry once; pages
    // late in a document render slowest (cold fonts/images in the worker) and
    // are the most exposed to transient failures right after a long jump.
    let retryTimeoutId: ReturnType<typeof setTimeout> | undefined;
    const startRender = (attempt: number) => {
      renderPage().catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof Error && err.name === 'RenderingCancelledException') return;
        console.error(`Failed to render page ${pageNumber} (attempt ${attempt}):`, err);
        if (attempt === 1) {
          retryTimeoutId = setTimeout(() => {
            if (!cancelled) startRender(2);
          }, 250);
        }
      });
    };

    // Debounce render to batch rapid scale/visibility changes during fast
    // scroll or zoom gestures, preventing excessive concurrent canvas allocations.
    // Skip debounce for priority renders (deliberate navigation via TOC, page
    // input, or prev/next buttons) so the target page appears immediately.
    const delay = priorityRef.current ? 0 : RENDER_DEBOUNCE_MS;
    const timeoutId = setTimeout(() => {
      if (!cancelled) startRender(1);
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      clearTimeout(retryTimeoutId);
      renderTaskRef.current?.cancel();
      textLayerInstanceRef.current?.cancel();
      // Release canvas memory explicitly so WebKit frees the backing buffer
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      // Free pdf.js's per-page caches (operator list, fonts, intent state).
      // Safe to call after cancel(); pdf.js handles in-flight work.
      pageRef.current?.cleanup();
      pageRef.current = null;
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

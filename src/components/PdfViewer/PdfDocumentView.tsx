import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfHighlight } from '../../types/annotation';
import type { CropBox } from '../../types/crop';
import { PdfPageView, type TextSelection } from './PdfPageView';
import styles from './PdfDocumentView.module.css';

interface Props {
  pdfDoc: PDFDocumentProxy;
  numPages: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  pageDimensions: { width: number; height: number }[];
  highlights: PdfHighlight[];
  crop?: CropBox;
  twoPageView: boolean;
  onTextSelected: (selection: TextSelection) => void;
  onSelectionCleared: () => void;
  onHighlightClick: (highlightId: string, anchorRect: DOMRect) => void;
  onPageChange: (page: number) => void;
}

export interface PdfDocumentViewHandle {
  scrollToPage: (page: number, offsetTop?: number | null, behavior?: ScrollBehavior) => void;
  getScrollPosition: () => { page: number; offsetTop: number } | null;
}

// Reduce buffer on touch/mobile devices to limit canvas memory usage.
// 3 pages (BUFFER=1) is sufficient for smooth touch scrolling; desktop
// benefits from the extra buffer for fast wheel/keyboard scrolling.
const BUFFER = ('ontouchstart' in window || navigator.maxTouchPoints > 0) ? 1 : 2;

export const PdfDocumentView = forwardRef<PdfDocumentViewHandle, Props>(
  function PdfDocumentView(
    { pdfDoc, numPages, scale, pageWidth, pageHeight, pageDimensions, highlights, crop, twoPageView, onTextSelected, onSelectionCleared, onHighlightClick, onPageChange },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({
      start: 1,
      end: Math.min(numPages, 5),
    });

    useImperativeHandle(ref, () => ({
      scrollToPage(page: number, offsetTop?: number | null, behavior: ScrollBehavior = 'smooth') {
        const container = containerRef.current;
        if (!container) return;

        const doScroll = () => {
          const pageEl = container.querySelector(`[data-page-wrapper="${page}"]`) as HTMLElement | null;
          if (!pageEl) return;

          const containerRect = container.getBoundingClientRect();
          const pageRect = pageEl.getBoundingClientRect();
          const pageTopInContainer =
            pageRect.top - containerRect.top + container.scrollTop;

          if (offsetTop == null) {
            container.scrollTo({ top: pageTopInContainer, behavior });
          } else {
            // offsetTop is in viewport units at scale 1; multiply by current
            // scale to get the pixel offset inside the rendered page.
            const target = pageTopInContainer + offsetTop * scale;
            container.scrollTo({ top: target, behavior });
          }
        };

        doScroll();

        // For instant scrolls, correct for layout shift caused by virtualization.
        // The initial scroll triggers IntersectionObserver → visibleRange update →
        // React re-render. Placeholder pages becoming real content (or vice versa)
        // may shift positions. Double rAF waits for the observer callback, React
        // re-render, and DOM commit before re-measuring.
        if (behavior === 'instant') {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              doScroll();
            });
          });
        }
      },
      getScrollPosition() {
        const container = containerRef.current;
        if (!container) return null;
        const containerRect = container.getBoundingClientRect();
        const wrappers = container.querySelectorAll('[data-page-wrapper]');
        for (const wrapper of wrappers) {
          const rect = wrapper.getBoundingClientRect();
          // First page whose bottom is at or below the container top is the current page
          if (rect.bottom >= containerRect.top) {
            const pageNum = Number((wrapper as HTMLElement).dataset.pageWrapper);
            // How far we've scrolled into this page, converted to scale-1 units
            const scrolledIntoPage = Math.max(0, containerRect.top - rect.top);
            return { page: pageNum, offsetTop: scrolledIntoPage / scale };
          }
        }
        return null;
      },
    }), [scale]);

    // Track which pages are in view using IntersectionObserver
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const visiblePages = new Set<number>();

      const observer = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            const pageNum = Number(
              (entry.target as HTMLElement).dataset.pageWrapper,
            );
            if (entry.isIntersecting) {
              visiblePages.add(pageNum);
            } else {
              visiblePages.delete(pageNum);
            }
          }
          if (visiblePages.size > 0) {
            const sorted = Array.from(visiblePages).sort((a, b) => a - b);
            onPageChange(sorted[0]);
            setVisibleRange({
              start: Math.max(1, sorted[0] - BUFFER),
              end: Math.min(numPages, sorted[sorted.length - 1] + BUFFER),
            });
          }
        },
        { root: container, threshold: 0.01 },
      );

      // Observe all wrapper elements
      const wrappers = container.querySelectorAll('[data-page-wrapper]');
      wrappers.forEach(el => observer.observe(el));

      return () => observer.disconnect();
      // Note: `scale` is intentionally excluded.  IntersectionObserver
      // auto-recalculates when observed elements resize (zoom changes page
      // element sizes), so tearing down and recreating the observer on every
      // scale change is unnecessary.  Including it caused an infinite loop
      // when fit-width mode adapts zoom per-page: scale change → observer
      // recreates and fires immediately → detects different first-visible
      // page → currentPage changes → scale changes → repeat.
    }, [numPages, onPageChange, twoPageView]);

    const isPageVisible = useCallback(
      (page: number) => page >= visibleRange.start && page <= visibleRange.end,
      [visibleRange],
    );

    const getPageDims = useCallback(
      (pageNum: number) => {
        if (pageDimensions.length >= pageNum) {
          return pageDimensions[pageNum - 1];
        }
        return { width: pageWidth, height: pageHeight };
      },
      [pageDimensions, pageWidth, pageHeight],
    );

    const cropT = crop?.top ?? 0;
    const cropR = crop?.right ?? 0;
    const cropB = crop?.bottom ?? 0;
    const cropL = crop?.left ?? 0;

    const renderPageContent = (pageNum: number) => {
      const dims = getPageDims(pageNum);
      if (isPageVisible(pageNum)) {
        return (
          <PdfPageView
            pdfDoc={pdfDoc}
            pageNumber={pageNum}
            scale={scale}
            expectedWidth={dims.width}
            expectedHeight={dims.height}
            highlights={highlights}
            crop={crop}
            onTextSelected={onTextSelected}
            onSelectionCleared={onSelectionCleared}
            onHighlightClick={onHighlightClick}
          />
        );
      }
      const isCropped = cropT > 0 || cropR > 0 || cropB > 0 || cropL > 0;
      return (
        <div
          className={styles.placeholder}
          style={{
            width: Math.floor(dims.width * (isCropped ? 1 - cropL - cropR : 1) * scale),
            height: Math.floor(dims.height * (isCropped ? 1 - cropT - cropB : 1) * scale),
          }}
        />
      );
    };

    let pages: ReactNode[];

    if (twoPageView && numPages > 1) {
      // Page 1 is shown alone (cover); subsequent pages are paired.
      const rows: React.ReactNode[] = [];

      rows.push(
        <div key={1} className={styles.pageWrapper}>
          <div data-page-wrapper={1}>
            {renderPageContent(1)}
          </div>
        </div>,
      );

      for (let i = 2; i <= numPages; i += 2) {
        const left = i;
        const right = i + 1 <= numPages ? i + 1 : null;
        rows.push(
          <div key={left} className={styles.twoPageRow}>
            <div data-page-wrapper={left}>
              {renderPageContent(left)}
            </div>
            {right !== null && (
              <div data-page-wrapper={right}>
                {renderPageContent(right)}
              </div>
            )}
          </div>,
        );
      }

      pages = rows;
    } else {
      pages = [];
      for (let i = 1; i <= numPages; i++) {
        pages.push(
          <div key={i} data-page-wrapper={i} className={styles.pageWrapper}>
            {renderPageContent(i)}
          </div>,
        );
      }
    }

    return (
      <div ref={containerRef} className={styles.container}>
        {pages}
      </div>
    );
  },
);

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfHighlight } from '../../types/annotation';
import { PdfPageView, type TextSelection } from './PdfPageView';
import styles from './PdfDocumentView.module.css';

interface Props {
  pdfDoc: PDFDocumentProxy;
  numPages: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  highlights: PdfHighlight[];
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

const BUFFER = 2;

export const PdfDocumentView = forwardRef<PdfDocumentViewHandle, Props>(
  function PdfDocumentView(
    { pdfDoc, numPages, scale, pageWidth, pageHeight, highlights, twoPageView, onTextSelected, onSelectionCleared, onHighlightClick, onPageChange },
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
        const pageEl = container.querySelector(`[data-page-wrapper="${page}"]`);
        if (!pageEl) return;

        if (offsetTop == null) {
          // No sub-page offset – just scroll to the top of the page
          pageEl.scrollIntoView({ behavior, block: 'start' });
          return;
        }

        // Compute the precise scroll position within the container.
        // offsetTop is in viewport units at scale 1; multiply by current
        // scale to get the pixel offset inside the rendered page.
        const containerRect = container.getBoundingClientRect();
        const pageRect = (pageEl as HTMLElement).getBoundingClientRect();
        const pageTopInContainer =
          pageRect.top - containerRect.top + container.scrollTop;
        const target = pageTopInContainer + offsetTop * scale;

        container.scrollTo({ top: target, behavior });
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
    }, [numPages, onPageChange, scale, twoPageView]);

    const isPageVisible = useCallback(
      (page: number) => page >= visibleRange.start && page <= visibleRange.end,
      [visibleRange],
    );

    const renderPageContent = (pageNum: number) =>
      isPageVisible(pageNum) ? (
        <PdfPageView
          pdfDoc={pdfDoc}
          pageNumber={pageNum}
          scale={scale}
          highlights={highlights}
          onTextSelected={onTextSelected}
          onSelectionCleared={onSelectionCleared}
          onHighlightClick={onHighlightClick}
        />
      ) : (
        <div
          className={styles.placeholder}
          style={{
            width: Math.floor(pageWidth * scale),
            height: Math.floor(pageHeight * scale),
          }}
        />
      );

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

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfHighlight } from '../../types/annotation';
import { PdfPageView, type TextSelection } from './PdfPageView';
import styles from './PdfDocumentView.module.css';

interface Props {
  pdfDoc: PDFDocumentProxy;
  numPages: number;
  scale: number;
  highlights: PdfHighlight[];
  onTextSelected: (selection: TextSelection) => void;
  onSelectionCleared: () => void;
  onHighlightClick: (highlightId: string, anchorRect: DOMRect) => void;
  onPageChange: (page: number) => void;
}

export interface PdfDocumentViewHandle {
  scrollToPage: (page: number) => void;
}

export const PdfDocumentView = forwardRef<PdfDocumentViewHandle, Props>(
  function PdfDocumentView(
    { pdfDoc, numPages, scale, highlights, onTextSelected, onSelectionCleared, onHighlightClick, onPageChange },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({ start: 1, end: 3 });

    useImperativeHandle(ref, () => ({
      scrollToPage(page: number) {
        const container = containerRef.current;
        if (!container) return;
        const pageEl = container.querySelector(`[data-page-number="${page}"]`);
        if (pageEl) {
          pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
    }));

    // Track which pages are in view using IntersectionObserver
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const pageElements = container.querySelectorAll('[data-page-number]');
      if (pageElements.length === 0) return;

      const visiblePages = new Set<number>();

      const observer = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            const pageNum = Number(
              (entry.target as HTMLElement).dataset.pageNumber,
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
              start: Math.max(1, sorted[0] - 2),
              end: Math.min(numPages, sorted[sorted.length - 1] + 2),
            });
          }
        },
        { root: container, threshold: 0.1 },
      );

      pageElements.forEach(el => observer.observe(el));
      return () => observer.disconnect();
    }, [numPages, onPageChange, scale]);

    const isPageVisible = useCallback(
      (page: number) => page >= visibleRange.start && page <= visibleRange.end,
      [visibleRange],
    );

    const pages = [];
    for (let i = 1; i <= numPages; i++) {
      pages.push(
        <div key={i} data-page-number={i} className={styles.pageWrapper}>
          {isPageVisible(i) ? (
            <PdfPageView
              pdfDoc={pdfDoc}
              pageNumber={i}
              scale={scale}
              highlights={highlights}
              onTextSelected={onTextSelected}
              onSelectionCleared={onSelectionCleared}
              onHighlightClick={onHighlightClick}
            />
          ) : (
            <div className={styles.placeholder} />
          )}
        </div>,
      );
    }

    return (
      <div ref={containerRef} className={styles.container}>
        {pages}
      </div>
    );
  },
);

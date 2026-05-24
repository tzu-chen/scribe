import { useRef, useEffect, useCallback, useState, useMemo, useLayoutEffect, forwardRef, useImperativeHandle, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfHighlight } from '../../types/annotation';
import type { CropBox } from '../../types/crop';
import { PdfPageView, type TextSelection } from './PdfPageView';
import {
  buildLayoutModel,
  positionToScrollTop,
  scrollTopToPosition,
  type LayoutConstants,
  type ViewerPosition,
} from './positionMath';
import styles from './PdfDocumentView.module.css';

interface Props {
  pdfDoc?: PDFDocumentProxy;
  numPages: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
  pageDimensions: { width: number; height: number }[];
  highlights?: PdfHighlight[];
  crop?: CropBox;
  cropEven?: CropBox;
  twoPageView: boolean;
  onTextSelected?: (selection: TextSelection) => void;
  onSelectionCleared?: () => void;
  onHighlightClick?: (highlightId: string, anchorRect: DOMRect) => void;
  onPageChange: (page: number) => void;
  /** Initial position to restore on first mount, and whenever the parent
   *  externally swaps it (e.g. after a server-prefs fetch lands). Internal
   *  scroll-driven updates do not depend on this prop. */
  restorePosition?: ViewerPosition;
  /** Fires (rAF-throttled) on every user scroll with the current scale-invariant
   *  position. This is the only source of truth the parent should persist. */
  onPositionChange?: (position: ViewerPosition) => void;
  /** Reports the inner content width of the scrollable container (excludes
   * padding and scrollbar) — the actual horizontal space pages can occupy. */
  onContainerResize?: (width: number) => void;
  /** Custom page renderer. When provided, replaces the default PdfPageView. */
  renderVisiblePage?: (pageNum: number, dims: { width: number; height: number }, scale: number, crop: CropBox | undefined, priority: boolean) => ReactNode;
}

export interface PdfDocumentViewHandle {
  scrollToPage: (page: number, offsetTop?: number | null, behavior?: ScrollBehavior) => void;
  /** Returns the last-known scale-invariant position. Safe on hidden tabs
   *  (returns the cached value, not a DOM measurement). */
  getPosition: () => ViewerPosition | null;
}

// Reduce buffer on touch/mobile devices to limit canvas memory usage.
// 3 pages (BUFFER=1) is sufficient for smooth touch scrolling; desktop
// benefits from the extra buffer for fast wheel/keyboard scrolling.
const BUFFER = ('ontouchstart' in window || navigator.maxTouchPoints > 0) ? 1 : 2;

const DEFAULT_CONSTANTS: LayoutConstants = { paddingTopPx: 16, marginPx: 8 };

export const PdfDocumentView = forwardRef<PdfDocumentViewHandle, Props>(
  function PdfDocumentView(
    { pdfDoc, numPages, scale, pageWidth, pageHeight, pageDimensions, highlights, crop, cropEven, twoPageView, onTextSelected, onSelectionCleared, onHighlightClick, onPageChange, restorePosition, onPositionChange, onContainerResize, renderVisiblePage },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    // Flag set by scrollToPage so newly-rendered pages skip the render debounce.
    const navigationPendingRef = useRef(false);
    const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({
      start: 1,
      end: Math.min(numPages, 1 + BUFFER * 2),
    });

    const layoutModel = useMemo(
      () => buildLayoutModel(pageDimensions, twoPageView, crop, cropEven),
      [pageDimensions, twoPageView, crop, cropEven],
    );

    // CSS-driven layout constants. Read from computed style so mobile (padding:0)
    // and desktop (padding:16px) breakpoints are reflected. Updated via the same
    // RO that reports container width.
    const [constants, setConstants] = useState<LayoutConstants>(DEFAULT_CONSTANTS);

    // Position-of-record: updated by the scroll listener, seeded from restorePosition.
    const positionRef = useRef<ViewerPosition>(
      restorePosition ?? { pageIndex: 1, withinPageOffset: 0 },
    );

    const onPositionChangeRef = useRef(onPositionChange);
    onPositionChangeRef.current = onPositionChange;

    useImperativeHandle(ref, () => ({
      scrollToPage(page: number, offsetTop?: number | null, behavior: ScrollBehavior = 'smooth') {
        const container = containerRef.current;
        if (!container) return;

        // Mark as deliberate navigation so newly-mounted pages skip the
        // render debounce. Cleared after the IO → React render cycle settles.
        navigationPendingRef.current = true;

        const target = positionToScrollTop(
          { pageIndex: page, withinPageOffset: offsetTop ?? 0 },
          scale,
          layoutModel,
          constants,
        );
        // Update positionRef immediately so the parent's debounced save
        // reflects the navigation (rather than the stale pre-jump position).
        positionRef.current = {
          pageIndex: page,
          withinPageOffset: offsetTop ?? 0,
        };
        container.scrollTo({ top: target, behavior });

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            navigationPendingRef.current = false;
          });
        });
      },
      getPosition() {
        if (!containerRef.current) return null;
        return positionRef.current;
      },
    }), [scale, layoutModel, constants]);

    // Scroll listener: the ONLY source that updates positionRef and notifies the parent.
    // Ignores events fired while the container has no layout (display:none from a
    // hidden in-app tab). Browsers fire a synthetic scroll event when an
    // overflow:auto container becomes visible again if the preserved scrollTop
    // exceeds the (possibly stale) maxScroll and gets clamped — reading that
    // clamped value at a mid-transition scale closure would corrupt positionRef.
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      let rafId: number | null = null;
      const onScroll = () => {
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          if (container.clientHeight === 0) return;
          const pos = scrollTopToPosition(container.scrollTop, scale, layoutModel, constants);
          positionRef.current = pos;
          onPositionChangeRef.current?.(pos);
        });
      };
      container.addEventListener('scroll', onScroll, { passive: true });
      return () => {
        container.removeEventListener('scroll', onScroll);
        if (rafId !== null) cancelAnimationFrame(rafId);
      };
    }, [scale, layoutModel, constants]);

    // Re-apply current position whenever the (scale, layoutModel, constants)
    // mapping changes. Replaces the parent's old "save scrollTop, restore after
    // resize" dance. Position is preserved across zoom, fit-width, two-page,
    // sidebar/immersive toggles, and crop changes by construction.
    // Skips while the container is display:none — the assignment would be a
    // no-op anyway, and skipping avoids racing with the post-show re-render.
    useLayoutEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      if (layoutModel.numPages === 0) return;
      if (container.clientHeight === 0) return;
      const target = positionToScrollTop(positionRef.current, scale, layoutModel, constants);
      if (Math.abs(container.scrollTop - target) > 1) {
        container.scrollTop = target;
      }
    }, [scale, layoutModel, constants]);

    // One-shot restore when the parent hands us a position (initial mount, or
    // when external state — e.g. server prefs fetch — supplies a different
    // initial value).
    useLayoutEffect(() => {
      if (!restorePosition) return;
      const container = containerRef.current;
      if (!container) return;
      if (layoutModel.numPages === 0) return;
      positionRef.current = restorePosition;
      container.scrollTop = positionToScrollTop(restorePosition, scale, layoutModel, constants);
      // Intentionally only depends on restorePosition: applying on every
      // scale/layout change would clobber the user's scrolling.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restorePosition]);

    // Apply restorePosition once the layout model becomes non-empty (PDF loaded
    // after first paint). Without this, a fast-loading restorePosition prop set
    // before pageDimensions arrives would be lost.
    const appliedFirstLayoutRef = useRef(false);
    useLayoutEffect(() => {
      if (appliedFirstLayoutRef.current) return;
      if (layoutModel.numPages === 0) return;
      appliedFirstLayoutRef.current = true;
      const container = containerRef.current;
      if (!container) return;
      const target = positionToScrollTop(positionRef.current, scale, layoutModel, constants);
      container.scrollTop = target;
    }, [scale, layoutModel, constants]);

    // Report the container's inner content width AND read padding-top so the
    // layout model uses the actual CSS values (mobile collapses padding to 0).
    // Ignores measurements taken while the container has no layout: when an
    // in-app tab gets `display:none`, the RO fires one final time with
    // clientWidth=0. Forwarding that would collapse the parent's effective
    // zoom to the fallback value, re-render at the wrong scale, and let the
    // browser clamp the preserved scrollTop on un-hide — corrupting position.
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const measure = (el: HTMLDivElement) => {
        if (el.clientWidth === 0) return;
        const cs = window.getComputedStyle(el);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const padT = parseFloat(cs.paddingTop) || 0;
        onContainerResize?.(el.clientWidth - padL - padR);
        setConstants(prev =>
          prev.paddingTopPx === padT ? prev : { ...prev, paddingTopPx: padT }
        );
      };
      measure(container);
      const ro = new ResizeObserver(() => {
        if (containerRef.current) measure(containerRef.current);
      });
      ro.observe(container);
      return () => ro.disconnect();
    }, [onContainerResize]);

    // Track which pages are in view using IntersectionObserver
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const visiblePages = new Set<number>();
      // Coalesce IO callbacks within a single frame so momentum-scroll bursts
      // collapse to one setVisibleRange() commit instead of many.
      let rafId: number | null = null;
      let pending: IntersectionObserverEntry[] = [];

      const flush = () => {
        rafId = null;
        for (const entry of pending) {
          const pageNum = Number(
            (entry.target as HTMLElement).dataset.pageWrapper,
          );
          if (entry.isIntersecting) {
            visiblePages.add(pageNum);
          } else {
            visiblePages.delete(pageNum);
          }
        }
        pending = [];
        if (visiblePages.size === 0) return;
        const sorted = Array.from(visiblePages).sort((a, b) => a - b);
        onPageChange(sorted[0]);
        setVisibleRange({
          start: Math.max(1, sorted[0] - BUFFER),
          end: Math.min(numPages, sorted[sorted.length - 1] + BUFFER),
        });
      };

      const observer = new IntersectionObserver(
        entries => {
          pending.push(...entries);
          if (rafId === null) rafId = requestAnimationFrame(flush);
        },
        // threshold 0.1 + rootMargin give hysteresis so pages don't flap
        // in/out of the visible set when a momentum flick grazes their edges.
        { root: container, threshold: 0.1, rootMargin: '100px 0px' },
      );

      // Observe all wrapper elements
      const wrappers = container.querySelectorAll('[data-page-wrapper]');
      wrappers.forEach(el => observer.observe(el));

      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        observer.disconnect();
      };
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

    const cropForPage = (pageNum: number): CropBox | undefined => {
      const c = pageNum % 2 === 1 ? crop : (cropEven ?? crop);
      return c;
    };

    const renderPageContent = (pageNum: number) => {
      const dims = getPageDims(pageNum);
      const pageCrop = cropForPage(pageNum);
      if (isPageVisible(pageNum)) {
        if (renderVisiblePage) {
          return renderVisiblePage(pageNum, dims, scale, pageCrop, navigationPendingRef.current);
        }
        return (
          <PdfPageView
            pdfDoc={pdfDoc!}
            pageNumber={pageNum}
            scale={scale}
            expectedWidth={dims.width}
            expectedHeight={dims.height}
            highlights={highlights || []}
            crop={pageCrop}
            priority={navigationPendingRef.current}
            onTextSelected={onTextSelected!}
            onSelectionCleared={onSelectionCleared!}
            onHighlightClick={onHighlightClick!}
          />
        );
      }
      const cropT = pageCrop?.top ?? 0;
      const cropR = pageCrop?.right ?? 0;
      const cropB = pageCrop?.bottom ?? 0;
      const cropL = pageCrop?.left ?? 0;
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

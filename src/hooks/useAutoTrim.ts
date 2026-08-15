import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { DjvuDocument } from '../services/documentLoader';
import type { CropBox, TrimMode } from '../types/crop';
import { hasCrop } from '../types/crop';
import {
  createTrimCanvas,
  detectDjvuPageCrop,
  detectPdfPageCrop,
  unifyCrops,
} from '../utils/autoTrim';

// Pages sampled to derive the document's single box in `uniform` mode. Spread
// evenly through the book, measured once — after that the box is settled and
// no further work happens, so page geometry stops moving under the reader.
const UNIFORM_SAMPLES = 24;

// `page` mode measures lazily around the reading position instead (like
// Okular's Trim Margins, which measures a page the first time it's laid out),
// so opening a 900-page scan doesn't stall on measuring everything up front.
const WINDOW_BEFORE = 1;
const WINDOW_AFTER = 3;
/** Spread sample in `page` mode too — it backs pages not yet measured. */
const PAGE_MODE_SEED = 8;

/** Re-render (and therefore re-layout) at most this often while measuring. */
const FLUSH_MS = 150;

interface Params {
  mode: TrimMode;
  pdfDoc?: PDFDocumentProxy;
  djvuDoc?: DjvuDocument;
  numPages: number;
  currentPage: number;
}

export interface AutoTrim {
  /** Trim box for a page under the active mode. */
  cropForPage: (page: number) => CropBox | undefined;
  /** The document-wide box per parity. This *is* the crop in `uniform` mode;
   *  in `page` mode it backs unmeasured pages and drives fit-width, where a
   *  per-page width would make the zoom level jitter while scrolling. */
  uniform: { odd: CropBox; even: CropBox };
  /** How many pages have been measured so far. */
  measured: number;
  /** Boxes for every page, for export. */
  measureAll: (onProgress?: (done: number, total: number) => void) => Promise<Map<number, CropBox>>;
}

function whenIdle(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 300 });
    } else {
      setTimeout(resolve, 16);
    }
  });
}

/** `count` page numbers spread evenly across the document. */
function spreadSample(numPages: number, count: number): number[] {
  const n = Math.min(count, numPages);
  const pages: number[] = [];
  for (let i = 0; i < n; i++) {
    pages.push(Math.max(1, Math.round(((i + 0.5) / n) * numPages)));
  }
  return pages;
}

export function useAutoTrim({ mode, pdfDoc, djvuDoc, numPages, currentPage }: Params): AutoTrim {
  // cacheRef is authoritative and mutated by the measuring loop; `cache` is the
  // snapshot React renders from, swapped in on a throttled flush so a burst of
  // measurements doesn't rebuild the layout model once per page.
  const cacheRef = useRef(new Map<number, CropBox>());
  const [cache, setCache] = useState<Map<number, CropBox>>(cacheRef.current);
  /** Pages already measured — including ones that came back untrustworthy, so
   *  we don't pay for them twice. */
  const attemptedRef = useRef(new Set<number>());
  const pendingRef = useRef<number[]>([]);
  const runningRef = useRef(false);
  const seededRef = useRef(new Set<TrimMode>());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Bumped whenever in-flight work must be abandoned (document swap, unmount).
  const genRef = useRef(0);

  const flush = useCallback(() => {
    setCache(new Map(cacheRef.current));
  }, []);

  // Drop everything when the document changes — boxes are page-content specific.
  useEffect(() => {
    genRef.current++;
    cacheRef.current = new Map();
    attemptedRef.current = new Set();
    pendingRef.current = [];
    seededRef.current = new Set();
    flush();
    return () => {
      // Bumping the *live* generation is the point: it tells whatever loop is
      // mid-measurement to drop its results.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      genRef.current++;
    };
  }, [pdfDoc, djvuDoc, flush]);

  const measurePage = useCallback(async (page: number): Promise<CropBox | null> => {
    try {
      if (pdfDoc) {
        if (!canvasRef.current) canvasRef.current = createTrimCanvas();
        return await detectPdfPageCrop(pdfDoc, page, canvasRef.current);
      }
      if (djvuDoc) {
        const djvuPage = djvuDoc.pages[page - 1];
        return djvuPage ? detectDjvuPageCrop(djvuPage) : null;
      }
    } catch (err) {
      console.error(`Auto-trim failed to measure page ${page}:`, err);
    }
    return null;
  }, [pdfDoc, djvuDoc]);

  const pump = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    const gen = genRef.current;
    void (async () => {
      let dirty = false;
      let lastFlush = performance.now();
      try {
        while (pendingRef.current.length > 0 && gen === genRef.current) {
          const page = pendingRef.current.shift()!;
          if (attemptedRef.current.has(page)) continue;
          attemptedRef.current.add(page);
          const box = await measurePage(page);
          if (gen !== genRef.current) return;
          if (box) {
            cacheRef.current.set(page, box);
            dirty = true;
          }
          if (dirty && performance.now() - lastFlush >= FLUSH_MS) {
            lastFlush = performance.now();
            dirty = false;
            flush();
          }
          // Measuring competes with the viewer's own page rendering; give the
          // browser the frame back between pages.
          await whenIdle();
        }
      } finally {
        runningRef.current = false;
        if (dirty && gen === genRef.current) flush();
        // Work queued while this (now stale) run was suspended mid-measurement
        // would otherwise sit until the next scroll nudged the effect.
        if (pendingRef.current.length > 0) pumpRef.current();
      }
    })();
  }, [measurePage, flush]);

  const pumpRef = useRef(pump);
  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  useEffect(() => {
    if (mode === 'off' || numPages === 0) return;
    if (!pdfDoc && !djvuDoc) return;

    const wanted: number[] = [];
    if (mode === 'page') {
      for (
        let p = Math.max(1, currentPage - WINDOW_BEFORE);
        p <= Math.min(numPages, currentPage + WINDOW_AFTER);
        p++
      ) {
        wanted.push(p);
      }
    }
    // The spread sample is PDF-only: a DjVu page has to be fully decoded to be
    // measured, far too expensive for pages the reader hasn't opened. DjVu in
    // uniform mode therefore settles on the pages that get read.
    if (pdfDoc && !seededRef.current.has(mode)) {
      seededRef.current.add(mode);
      wanted.push(...spreadSample(numPages, mode === 'uniform' ? UNIFORM_SAMPLES : PAGE_MODE_SEED));
    } else if (!pdfDoc && mode === 'uniform') {
      wanted.push(currentPage);
    }

    const fresh = wanted.filter(
      p => !attemptedRef.current.has(p) && !pendingRef.current.includes(p),
    );
    if (fresh.length === 0) return;
    // Newest window first: it's what the reader is looking at.
    pendingRef.current = [...fresh, ...pendingRef.current];
    pump();
  }, [mode, pdfDoc, djvuDoc, numPages, currentPage, pump]);

  // Stop measuring as soon as trimming is switched off. Dropping the queue is
  // enough — the loop exits after the page in flight, and that page's box is
  // worth keeping. The cache survives, so switching back on is instant.
  useEffect(() => {
    if (mode !== 'off') return;
    pendingRef.current = [];
  }, [mode]);

  const uniform = useMemo(() => {
    const odd: CropBox[] = [];
    const even: CropBox[] = [];
    for (const [page, box] of cache) {
      (page % 2 === 1 ? odd : even).push(box);
    }
    return unifyCrops(odd, even);
  }, [cache]);

  const cropForPage = useCallback((page: number): CropBox | undefined => {
    const box = mode === 'page' ? cache.get(page) : undefined;
    const resolved = box ?? (page % 2 === 1 ? uniform.odd : uniform.even);
    return hasCrop(resolved) ? resolved : undefined;
  }, [mode, cache, uniform]);

  const measureAll = useCallback(async (
    onProgress?: (done: number, total: number) => void,
  ): Promise<Map<number, CropBox>> => {
    const result = new Map<number, CropBox>();
    if (!pdfDoc && !djvuDoc) return result;

    // In uniform mode only the sample needs measuring — every page then gets
    // the same box, so exporting a 900-page scan costs 24 measurements.
    const toMeasure = mode === 'uniform'
      ? spreadSample(numPages, UNIFORM_SAMPLES)
      : Array.from({ length: numPages }, (_, i) => i + 1);

    for (let i = 0; i < toMeasure.length; i++) {
      const page = toMeasure[i];
      if (!cacheRef.current.has(page) && !attemptedRef.current.has(page)) {
        const box = await measurePage(page);
        attemptedRef.current.add(page);
        if (box) cacheRef.current.set(page, box);
      }
      onProgress?.(i + 1, toMeasure.length);
      // Yield periodically so the export doesn't freeze the tab outright.
      if (i % 8 === 7) await new Promise(resolve => setTimeout(resolve, 0));
    }
    flush();

    const odd: CropBox[] = [];
    const even: CropBox[] = [];
    for (const [page, box] of cacheRef.current) {
      (page % 2 === 1 ? odd : even).push(box);
    }
    const documentWide = unifyCrops(odd, even);

    for (let page = 1; page <= numPages; page++) {
      // Pages that couldn't be measured (blank, or otherwise untrustworthy)
      // fall back to the document-wide box, so the export crops consistently.
      const box = (mode === 'page' ? cacheRef.current.get(page) : undefined)
        ?? (page % 2 === 1 ? documentWide.odd : documentWide.even);
      result.set(page, box);
    }
    return result;
  }, [mode, pdfDoc, djvuDoc, numPages, measurePage, flush]);

  return { cropForPage, uniform, measured: cache.size, measureAll };
}

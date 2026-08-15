import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { DjvuPage } from '../services/documentLoader';
import type { CropBox } from '../types/crop';
import { NO_CROP } from '../types/crop';

// Automatic margin detection ("trim margins"), modelled on Okular's Trim
// Margins: each page is rendered small, the bounding box of its non-background
// pixels is measured, and the surrounding margin becomes the page's crop.
//
// Two hardening passes are added on top of Okular's plain bounding box, because
// scanned books routinely defeat it: single dust specks in the margin would
// otherwise pin the box to the full page.
//   1. A speck must have an ink neighbour to count (1-pass erosion).
//   2. A row/column must carry a minimum number of ink pixels to be "content".

/** Long-edge resolution pages are sampled at. Enough for ~0.3% crop precision. */
const SAMPLE_WIDTH = 320;

export interface AutoTrimOptions {
  /** Luminance distance (0-255) from the page background that counts as ink. */
  threshold?: number;
  /** Margin kept around the detected content, as a fraction of the page size. */
  padding?: number;
  /** Hard cap on what may be trimmed from any single side. */
  maxCrop?: number;
}

const DEFAULT_OPTIONS: Required<AutoTrimOptions> = {
  threshold: 26,
  padding: 0.008,
  maxCrop: 0.45,
};

/** Content smaller than this fraction of the page means the detection is not
 *  trustworthy (blank page, a lone page number, a full-page scan artefact). */
const MIN_CONTENT_FRACTION = 0.15;

interface SampledPage {
  /** Darkest luminance within each sample block. */
  min: Uint8Array;
  /** Brightest luminance within each sample block. */
  max: Uint8Array;
  width: number;
  height: number;
}

/**
 * Reduce RGBA pixels to a small two-channel (darkest/brightest) luminance grid.
 *
 * Keeping both extremes per block makes the detection polarity-agnostic: dark
 * text on a light page registers through `min`, light text on a dark scan
 * through `max`. Taking extremes rather than an average also stops hairlines
 * from being averaged away into the background.
 */
function samplePage(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): SampledPage {
  const stride = Math.max(1, Math.floor(width / SAMPLE_WIDTH));
  const outW = Math.ceil(width / stride);
  const outH = Math.ceil(height / stride);
  const min = new Uint8Array(outW * outH).fill(255);
  const max = new Uint8Array(outW * outH);

  for (let y = 0; y < height; y++) {
    const oy = (y / stride) | 0;
    const rowBase = y * width * 4;
    const outRow = oy * outW;
    for (let x = 0; x < width; x++) {
      const i = rowBase + x * 4;
      const a = data[i + 3];
      // Composite over white: an un-painted PDF region is transparent, and
      // treating it as rgb(0,0,0) would read as ink covering the whole page.
      let lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      if (a !== 255) lum = ((lum * a) + 255 * (255 - a)) / 255 | 0;
      const o = outRow + ((x / stride) | 0);
      if (lum < min[o]) min[o] = lum;
      if (lum > max[o]) max[o] = lum;
    }
  }

  return { min, max, width: outW, height: outH };
}

/** Median luminance of the outermost 2-block ring — the page's background. */
function estimateBackground(page: SampledPage): number {
  const { min, max, width, height } = page;
  const ring: number[] = [];
  const depth = Math.min(2, Math.floor(Math.min(width, height) / 4)) || 1;
  const push = (o: number) => {
    ring.push(min[o]);
    ring.push(max[o]);
  };
  for (let d = 0; d < depth; d++) {
    for (let x = 0; x < width; x++) {
      push(d * width + x);
      push((height - 1 - d) * width + x);
    }
    for (let y = 0; y < height; y++) {
      push(y * width + d);
      push(y * width + (width - 1 - d));
    }
  }
  if (ring.length === 0) return 255;
  ring.sort((a, b) => a - b);
  return ring[ring.length >> 1];
}

/**
 * Measure the content bounding box of one sampled page and return it as a
 * CropBox of per-side margins. Returns null when the result is not trustworthy
 * (nothing found, or a suspiciously small content area) so the caller can fall
 * back to a document-wide estimate instead of zooming into a page number.
 */
export function detectContentCrop(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: AutoTrimOptions = {},
): CropBox | null {
  if (width <= 0 || height <= 0) return null;
  const { threshold, padding, maxCrop } = { ...DEFAULT_OPTIONS, ...options };

  const page = samplePage(data, width, height);
  const w = page.width;
  const h = page.height;
  const bg = estimateBackground(page);

  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) {
    const dev = Math.max(Math.abs(page.min[i] - bg), Math.abs(page.max[i] - bg));
    ink[i] = dev > threshold ? 1 : 0;
  }

  // Erode: an ink block with no ink neighbour is dust, not content.
  const rowInk = new Uint32Array(h);
  const colInk = new Uint32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!ink[i]) continue;
      const connected =
        (x > 0 && ink[i - 1]) ||
        (x < w - 1 && ink[i + 1]) ||
        (y > 0 && ink[i - w]) ||
        (y < h - 1 && ink[i + w]);
      if (!connected) continue;
      rowInk[y]++;
      colInk[x]++;
    }
  }

  const rowGate = Math.max(2, Math.round(w * 0.004));
  const colGate = Math.max(2, Math.round(h * 0.004));

  let top = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    if (rowInk[y] >= rowGate) {
      if (top === -1) top = y;
      bottom = y;
    }
  }
  let left = -1;
  let right = -1;
  for (let x = 0; x < w; x++) {
    if (colInk[x] >= colGate) {
      if (left === -1) left = x;
      right = x;
    }
  }

  if (top === -1 || left === -1) return null;

  const contentW = (right - left + 1) / w;
  const contentH = (bottom - top + 1) / h;
  if (contentW < MIN_CONTENT_FRACTION || contentH < MIN_CONTENT_FRACTION) return null;

  // Pad outwards by the requested margin plus one sample block, so sub-block
  // rounding can never shave a glyph.
  const padX = padding + 1 / w;
  const padY = padding + 1 / h;
  const clamp = (v: number) => Math.max(0, Math.min(maxCrop, Math.round(v * 1e4) / 1e4));

  return {
    top: clamp(top / h - padY),
    bottom: clamp((h - 1 - bottom) / h - padY),
    left: clamp(left / w - padX),
    right: clamp((w - 1 - right) / w - padX),
  };
}

/** Reusable off-screen canvas for page sampling — one per document at a time. */
export function createTrimCanvas(): HTMLCanvasElement {
  return document.createElement('canvas');
}

/** Render a PDF page at sampling resolution and measure its content box. */
export async function detectPdfPageCrop(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  options?: AutoTrimOptions,
): Promise<CropBox | null> {
  const page = await pdfDoc.getPage(pageNumber);
  try {
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: Math.min(1, SAMPLE_WIDTH / base.width),
    });
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport }).promise;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return detectContentCrop(img.data, img.width, img.height, options);
  } finally {
    // Drop the operator list / font state this measurement primed; otherwise
    // sampling a long book inflates the document's retained heap.
    page.cleanup();
  }
}

/** Measure a DjVu page's content box from its decoded bitmap. */
export function detectDjvuPageCrop(
  page: DjvuPage,
  options?: AutoTrimOptions,
): CropBox | null {
  const img = page.getImageData();
  return detectContentCrop(img.data, img.width, img.height, options);
}

/**
 * Smallest margin among the *typical* pages.
 *
 * A plain minimum is useless on real books: one full-bleed illustration or
 * decorative header bar measures a margin of ~0 and would open the crop back up
 * for the whole document. Those pages sit far below the tight cluster that body
 * pages form, so anything less than half the median is discarded as atypical
 * and the smallest survivor wins — which keeps the guarantee that matters, that
 * no ordinary page gets clipped.
 */
function typicalMin(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const floor = sorted[sorted.length >> 1] * 0.5;
  for (const v of sorted) {
    if (v >= floor) return v;
  }
  return sorted[0];
}

/** Collapse several measured pages into one document-wide box. */
export function aggregateCrops(boxes: CropBox[]): CropBox {
  if (boxes.length === 0) return NO_CROP;
  return {
    top: typicalMin(boxes.map(b => b.top)),
    right: typicalMin(boxes.map(b => b.right)),
    bottom: typicalMin(boxes.map(b => b.bottom)),
    left: typicalMin(boxes.map(b => b.left)),
  };
}

/**
 * Collapse measured pages into one box per parity, trimming to identical
 * dimensions.
 *
 * Books alternate their gutter — a recto page's wide margin is on the left, a
 * verso page's on the right — so each parity keeps its own left/right values.
 * What is made uniform is the *result*: one top/bottom for the whole document
 * (vertical margins don't alternate), and one horizontal extent, reached by
 * giving the narrower parity its difference back on whichever side it trims
 * hardest. Every page then renders at exactly the same size.
 */
export function unifyCrops(odd: CropBox[], even: CropBox[]): { odd: CropBox; even: CropBox } {
  if (odd.length === 0 && even.length === 0) return { odd: NO_CROP, even: NO_CROP };

  const overall = aggregateCrops([...odd, ...even]);
  // One page of a parity isn't enough to tell a real gutter from an outlier.
  const o = odd.length >= 2 ? aggregateCrops(odd) : overall;
  const e = even.length >= 2 ? aggregateCrops(even) : overall;

  const top = Math.min(o.top, e.top);
  const bottom = Math.min(o.bottom, e.bottom);
  const span = Math.max(1 - o.left - o.right, 1 - e.left - e.right);

  const widen = (c: CropBox): CropBox => {
    let give = span - (1 - c.left - c.right);
    if (give <= 1e-6) return { ...c, top, bottom };
    // Hand the difference back on the wider (gutter) side first, spilling onto
    // the other if that side runs out. `give` can never exceed left + right,
    // so the two parities always end up exactly the same width.
    const out = { ...c, top, bottom };
    for (const side of c.left >= c.right ? ['left', 'right'] as const : ['right', 'left'] as const) {
      const take = Math.min(give, out[side]);
      out[side] -= take;
      give -= take;
      if (give <= 1e-6) break;
    }
    return out;
  };

  return { odd: widen(o), even: widen(e) };
}

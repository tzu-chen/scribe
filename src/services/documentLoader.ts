import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export interface OutlineItem {
  title: string;
  pageNumber: number;
  destTop: number | null;
  children: OutlineItem[];
}

export interface DjvuDocument {
  pages: DjvuPage[];
  getContents(): DjvuContentsItem[] | null;
}

export interface DjvuPage {
  getWidth(): number;
  getHeight(): number;
  getDpi(): number;
  getImageData(rotate?: boolean): ImageData;
  init(): DjvuPage;
}

interface DjvuContentsItem {
  description: string;
  url: string;
  children?: DjvuContentsItem[];
}

export interface PageDims {
  width: number;
  height: number;
}

export interface LoadedPdf {
  pdfDoc: PDFDocumentProxy;
  numPages: number;
  pageDimensions: PageDims[];
  outline: OutlineItem[];
}

export interface LoadedDjvu {
  djvuDoc: DjvuDocument;
  numPages: number;
  pageDimensions: PageDims[];
  outline: OutlineItem[];
}

export function isDjvuBlob(blob: Blob | null, filename: string): boolean {
  if (!blob) return false;
  return blob.type === 'image/vnd.djvu'
    || blob.type === 'image/x-djvu'
    || filename.toLowerCase().endsWith('.djvu');
}

function extractDestTop(dest: unknown[], viewportHeight: number): number | null {
  if (dest.length < 2) return null;
  const typeObj = dest[1];
  const typeName =
    typeof typeObj === 'object' && typeObj !== null && 'name' in typeObj
      ? (typeObj as { name: string }).name
      : String(typeObj);

  let pdfTop: number | null = null;
  switch (typeName) {
    case 'XYZ':
      pdfTop = typeof dest[3] === 'number' ? dest[3] : null;
      break;
    case 'FitH':
    case 'FitBH':
      pdfTop = typeof dest[2] === 'number' ? dest[2] : null;
      break;
    case 'FitR':
      pdfTop = typeof dest[5] === 'number' ? dest[5] : null;
      break;
    default:
      return null;
  }
  if (pdfTop === null) return null;
  return viewportHeight - pdfTop;
}

async function resolvePdfOutline(
  doc: PDFDocumentProxy,
  items: { title: string; dest: unknown; items: unknown[] }[] | null,
): Promise<OutlineItem[]> {
  if (!items || items.length === 0) return [];
  const result: OutlineItem[] = [];
  for (const item of items) {
    let pageNumber = 1;
    let destTop: number | null = null;
    try {
      let dest: unknown[] | null = null;
      if (typeof item.dest === 'string') {
        dest = await doc.getDestination(item.dest);
        if (dest) {
          const ref = dest[0] as Parameters<PDFDocumentProxy['getPageIndex']>[0];
          pageNumber = (await doc.getPageIndex(ref)) + 1;
        }
      } else if (Array.isArray(item.dest) && item.dest.length > 0) {
        dest = item.dest as unknown[];
        const ref = item.dest[0] as Parameters<PDFDocumentProxy['getPageIndex']>[0];
        pageNumber = (await doc.getPageIndex(ref)) + 1;
      }
      if (dest) {
        const page = await doc.getPage(pageNumber);
        const vp = page.getViewport({ scale: 1 });
        destTop = extractDestTop(dest, vp.height);
      }
    } catch {
      /* fallback to page 1 / top */
    }
    const children = await resolvePdfOutline(
      doc,
      item.items as { title: string; dest: unknown; items: unknown[] }[],
    );
    result.push({ title: item.title, pageNumber, destTop, children });
  }
  return result;
}

export async function loadPdfDocument(blob: Blob): Promise<LoadedPdf> {
  const arrayBuffer = await blob.arrayBuffer();
  const doc = await pdfjsLib.getDocument({
    data: arrayBuffer,
    // pdf.js 5.x decodes JPEG 2000 (JPX) and JBIG2 images in WebAssembly. The
    // worker fetches those modules from this directory (trailing slash is
    // required); without it, such images render blank while text/vectors are
    // fine. The files are staged into public/pdf-wasm/ by scripts/copy-pdf-wasm.mjs.
    wasmUrl: `${import.meta.env.BASE_URL}pdf-wasm/`,
  }).promise;

  // Enumerate per-page dimensions with bounded concurrency. Awaiting getPage()
  // one page at a time serializes a worker round-trip per page, which dominates
  // first-paint latency on large (often scanned) documents. Pipelining in
  // chunks keeps the worker busy without flooding it. Dimensions remain exact
  // per-page viewports, so the layout model, scroll math, and jumps are
  // unaffected. getPage() for every page matches the previous behavior, so the
  // retained page-proxy set is unchanged.
  const dims: PageDims[] = new Array(doc.numPages);
  const CONCURRENCY = 24;
  for (let start = 1; start <= doc.numPages; start += CONCURRENCY) {
    const end = Math.min(start + CONCURRENCY - 1, doc.numPages);
    const batch: Promise<void>[] = [];
    for (let i = start; i <= end; i++) {
      batch.push(
        doc.getPage(i).then(page => {
          const vp = page.getViewport({ scale: 1 });
          dims[i - 1] = { width: vp.width, height: vp.height };
        }),
      );
    }
    await Promise.all(batch);
  }

  const rawOutline = await doc.getOutline();
  const outline = await resolvePdfOutline(doc, rawOutline);

  return { pdfDoc: doc, numPages: doc.numPages, pageDimensions: dims, outline };
}

function parseDjvuOutline(items: DjvuContentsItem[] | null): OutlineItem[] {
  if (!items || items.length === 0) return [];
  return items.map(item => {
    let pageNumber = 1;
    if (item.url && item.url.startsWith('#')) {
      const num = parseInt(item.url.slice(1), 10);
      if (!isNaN(num) && num >= 1) pageNumber = num;
    }
    return {
      title: item.description || '',
      pageNumber,
      destTop: null,
      children: parseDjvuOutline(item.children ?? null),
    };
  });
}

export async function loadDjvuDocument(blob: Blob): Promise<LoadedDjvu> {
  const arrayBuffer = await blob.arrayBuffer();
  const djvuModule = await import('djvujs-dist/library/src/DjVuDocument.js');
  const DjVuDocument = djvuModule.default;
  const doc = new DjVuDocument(arrayBuffer) as DjvuDocument;

  const count = doc.pages.length;
  const dims: PageDims[] = [];
  for (let i = 0; i < count; i++) {
    const page = doc.pages[i];
    page.init();
    const dpi = page.getDpi() || 300;
    const w = page.getWidth() * (72 / dpi);
    const h = page.getHeight() * (72 / dpi);
    dims.push({ width: w, height: h });
  }

  const outline = parseDjvuOutline(doc.getContents());
  return { djvuDoc: doc, numPages: count, pageDimensions: dims, outline };
}

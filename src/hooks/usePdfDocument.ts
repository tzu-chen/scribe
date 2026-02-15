import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export interface OutlineItem {
  title: string;
  pageNumber: number;
  /** Y offset from the top of the page in viewport units at scale 1 (null = top of page) */
  destTop: number | null;
  children: OutlineItem[];
}

/**
 * Extract the Y offset from the top of the page (in viewport units at scale 1)
 * from a resolved PDF destination array.
 *
 * PDF destinations encode a position type and parameters:
 *   [pageRef, { name: "XYZ" }, left, top, zoom]
 *   [pageRef, { name: "FitH" }, top]
 *   [pageRef, { name: "FitBH" }, top]
 *   etc.
 *
 * The `top` value is in PDF user-space coordinates (origin at bottom-left,
 * Y increases upward).  We convert it to an offset from the *top* of the
 * rendered page: offsetFromTop = viewportHeight − top.
 */
function extractDestTop(
  dest: unknown[],
  viewportHeight: number,
): number | null {
  if (dest.length < 2) return null;

  const typeObj = dest[1];
  const typeName =
    typeof typeObj === 'object' && typeObj !== null && 'name' in typeObj
      ? (typeObj as { name: string }).name
      : String(typeObj);

  let pdfTop: number | null = null;

  switch (typeName) {
    case 'XYZ':
      // [ref, XYZ, left, top, zoom]
      pdfTop = typeof dest[3] === 'number' ? dest[3] : null;
      break;
    case 'FitH':
    case 'FitBH':
      // [ref, FitH/FitBH, top]
      pdfTop = typeof dest[2] === 'number' ? dest[2] : null;
      break;
    case 'FitR':
      // [ref, FitR, left, bottom, right, top]
      pdfTop = typeof dest[5] === 'number' ? dest[5] : null;
      break;
    // Fit, FitV, FitB, FitBV → scroll to page top
    default:
      return null;
  }

  if (pdfTop === null) return null;
  return viewportHeight - pdfTop;
}

async function resolveOutline(
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
      // fallback to page 1, top of page
    }
    const children = await resolveOutline(
      doc,
      item.items as { title: string; dest: unknown; items: unknown[] }[],
    );
    result.push({ title: item.title, pageNumber, destTop, children });
  }
  return result;
}

export function usePdfDocument(blob: Blob | null) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(612);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [loading, setLoading] = useState(!!blob);
  const [error, setError] = useState<string | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!blob) return;

    let cancelled = false;
    setLoading(true);

    blob.arrayBuffer().then(async (arrayBuffer) => {
      try {
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        docRef.current = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);

        // Get actual first page width for fit-width calculation
        const firstPage = await doc.getPage(1);
        if (!cancelled) {
          const vp = firstPage.getViewport({ scale: 1 });
          setPageWidth(vp.width);
        }

        const rawOutline = await doc.getOutline();
        if (!cancelled) {
          const resolved = await resolveOutline(doc, rawOutline);
          setOutline(resolved);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [blob]);

  return { pdfDoc, numPages, pageWidth, outline, loading, error };
}

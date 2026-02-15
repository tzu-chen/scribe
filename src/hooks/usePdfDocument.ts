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
  children: OutlineItem[];
}

async function resolveOutline(
  doc: PDFDocumentProxy,
  items: { title: string; dest: unknown; items: unknown[] }[] | null,
): Promise<OutlineItem[]> {
  if (!items || items.length === 0) return [];
  const result: OutlineItem[] = [];
  for (const item of items) {
    let pageNumber = 1;
    try {
      if (typeof item.dest === 'string') {
        const dest = await doc.getDestination(item.dest);
        if (dest) {
          const ref = dest[0];
          pageNumber = (await doc.getPageIndex(ref)) + 1;
        }
      } else if (Array.isArray(item.dest) && item.dest.length > 0) {
        pageNumber = (await doc.getPageIndex(item.dest[0])) + 1;
      }
    } catch {
      // fallback to page 1
    }
    const children = await resolveOutline(
      doc,
      item.items as { title: string; dest: unknown; items: unknown[] }[],
    );
    result.push({ title: item.title, pageNumber, children });
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

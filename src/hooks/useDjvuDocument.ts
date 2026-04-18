import { useState, useEffect, useRef } from 'react';
import type { OutlineItem } from './usePdfDocument';

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

function parseDjvuOutline(items: DjvuContentsItem[] | null): OutlineItem[] {
  if (!items || items.length === 0) return [];
  return items.map(item => {
    // DjVu outline URLs are typically "#<pageNumber>" (1-indexed)
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

export function useDjvuDocument(blob: Blob | null) {
  const [djvuDoc, setDjvuDoc] = useState<DjvuDocument | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(612);
  const [pageHeight, setPageHeight] = useState(792);
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }[]>([]);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [loading, setLoading] = useState(!!blob);
  const [error, setError] = useState<string | null>(null);
  const docRef = useRef<DjvuDocument | null>(null);

  useEffect(() => {
    if (!blob) {
      setDjvuDoc(null);
      setNumPages(0);
      setOutline([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        if (cancelled) return;

        // Lazy-load djvujs-dist so the large bundle is only fetched for DjVu files
        const djvuModule = await import('djvujs-dist/library/src/DjVuDocument.js');
        if (cancelled) return;

        const DjVuDocument = djvuModule.default;
        const doc = new DjVuDocument(arrayBuffer) as DjvuDocument;
        docRef.current = doc;

        const count = doc.pages.length;
        setDjvuDoc(doc);
        setNumPages(count);

        // Collect page dimensions — DjVu pages store native pixel dimensions.
        // We normalize to 72 DPI equivalent (like PDF.js viewport at scale 1)
        // so zoom/crop math works consistently.
        const dims: { width: number; height: number }[] = [];
        for (let i = 0; i < count; i++) {
          const page = doc.pages[i];
          page.init();
          const dpi = page.getDpi() || 300;
          const w = page.getWidth() * (72 / dpi);
          const h = page.getHeight() * (72 / dpi);
          dims.push({ width: w, height: h });
        }

        if (!cancelled) {
          setPageDimensions(dims);
          if (dims.length > 0) {
            setPageWidth(dims[0].width);
            setPageHeight(dims[0].height);
          }
        }

        const contents = doc.getContents();
        if (!cancelled) {
          setOutline(parseDjvuOutline(contents));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load DjVu');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      docRef.current = null;
    };
  }, [blob]);

  return { djvuDoc, numPages, pageWidth, pageHeight, pageDimensions, outline, loading, error };
}

import { useEffect, useState } from 'react';
import { AnnotationType, Util } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { resolvePdfDest } from '../../services/documentLoader';
import styles from './PdfLinkLayer.module.css';

/** A link annotation, positioned as fractions of the full (untrimmed) page. */
interface PageLink {
  x: number;
  y: number;
  width: number;
  height: number;
  /** External target (pdf.js only sets this for URLs it considers safe). */
  url?: string;
  /** Internal target: a named destination or an explicit dest array. */
  dest?: unknown;
  /** Named action (FirstPage, PrevPage, …). */
  action?: string;
}

interface Props {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  /** Jump to a page; `destTop` is measured from the top of the full page at scale 1. */
  onNavigate: (page: number, destTop: number | null) => void;
}

export function PdfLinkLayer({ pdfDoc, pageNumber, onNavigate }: Props) {
  const [links, setLinks] = useState<PageLink[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(pageNumber);
      const annotations = await page.getAnnotations({ intent: 'display' });
      if (cancelled) return;
      // The scale-1 viewport applies the page's rotation, so the fractions
      // below line up with the rendered page whatever the zoom.
      const viewport = page.getViewport({ scale: 1 });
      const result: PageLink[] = [];
      for (const a of annotations) {
        if (a.annotationType !== AnnotationType.LINK) continue;
        if (!a.url && a.dest == null && !a.action) continue;
        const [x1, y1, x2, y2] = Util.normalizeRect(viewport.convertToViewportRectangle(a.rect));
        result.push({
          x: x1 / viewport.width,
          y: y1 / viewport.height,
          width: (x2 - x1) / viewport.width,
          height: (y2 - y1) / viewport.height,
          url: a.url || undefined,
          dest: a.dest ?? undefined,
          action: a.action || undefined,
        });
      }
      setLinks(result);
    })().catch(() => {
      // A page whose annotations fail to parse still renders; it just has no links.
    });
    return () => { cancelled = true; };
  }, [pdfDoc, pageNumber]);

  const follow = async (link: PageLink) => {
    if (link.dest != null) {
      const target = await resolvePdfDest(pdfDoc, link.dest).catch(() => null);
      if (target) onNavigate(target.pageNumber, target.destTop);
      return;
    }
    const actionPages: Record<string, number> = {
      FirstPage: 1,
      LastPage: pdfDoc.numPages,
      NextPage: pageNumber + 1,
      PrevPage: pageNumber - 1,
    };
    const page = link.action ? actionPages[link.action] : undefined;
    if (page !== undefined && page >= 1 && page <= pdfDoc.numPages) onNavigate(page, null);
  };

  if (links.length === 0) return null;

  return (
    <div className={styles.layer}>
      {links.map((link, i) => {
        const style = {
          left: `${link.x * 100}%`,
          top: `${link.y * 100}%`,
          width: `${link.width * 100}%`,
          height: `${link.height * 100}%`,
        };
        return link.url ? (
          <a
            key={i}
            className={styles.link}
            style={style}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            title={link.url}
            draggable={false}
          />
        ) : (
          <a
            key={i}
            className={styles.link}
            style={style}
            href="#"
            draggable={false}
            onClick={e => {
              e.preventDefault();
              void follow(link);
            }}
          />
        );
      })}
    </div>
  );
}

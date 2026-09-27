import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { attachmentStorage, type EnrichmentPayload } from './attachmentStorage';
import { isDjvuBlob, loadDjvuDocument } from './documentLoader';
import type { AttachmentMeta } from '../types/attachment';

/**
 * Client-side enrichment: the browser already ships pdf.js, so it parses the
 * file once (page count, metadata, a first-page thumbnail) and posts the
 * results to the server. The server stores them and re-guesses the kind.
 */

export const THUMBNAIL_WIDTH = 240;

export function needsEnrichment(meta: AttachmentMeta): boolean {
  return !meta.enrichedAt;
}

export function isPdf(meta: Pick<AttachmentMeta, 'type' | 'filename'>): boolean {
  return meta.type === 'application/pdf' || meta.filename.toLowerCase().endsWith('.pdf');
}

function canvasToJpeg(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.82);
}

async function renderPdfThumbnail(doc: PDFDocumentProxy): Promise<string | undefined> {
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = THUMBNAIL_WIDTH / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return canvasToJpeg(canvas);
  } catch {
    return undefined;
  }
}

function cleanMetaString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\s+/g, ' ').trim();
  if (!s) return undefined;
  // pdfTeX & friends leave placeholders behind; don't mistake them for a title.
  if (/^(untitled|title|document|microsoft word|\.dvi|.*\.(tex|dvi|doc|docx))$/i.test(s)) return undefined;
  return s;
}

function yearFrom(raw: unknown): number | undefined {
  if (typeof raw !== 'string') return undefined;
  const m = /(?:D:)?(\d{4})/.exec(raw);
  if (!m) return undefined;
  const y = parseInt(m[1], 10);
  return y >= 1800 && y <= 2100 ? y : undefined;
}

/** Build the payload from an already-loaded pdf.js document (viewer path). */
export async function payloadFromPdf(doc: PDFDocumentProxy, withThumbnail = true): Promise<EnrichmentPayload> {
  const payload: EnrichmentPayload = { pageCount: doc.numPages };
  try {
    const { info } = await doc.getMetadata();
    const i = (info ?? {}) as Record<string, unknown>;
    payload.title = cleanMetaString(i.Title);
    payload.authors = cleanMetaString(i.Author);
    payload.year = yearFrom(i.CreationDate) ?? yearFrom(i.ModDate);
    payload.creator = cleanMetaString(i.Creator);
    payload.producer = cleanMetaString(i.Producer);
  } catch {
    /* metadata is optional */
  }
  if (withThumbnail) payload.thumbnail = await renderPdfThumbnail(doc);
  return payload;
}

async function payloadFromDjvu(blob: Blob): Promise<EnrichmentPayload> {
  const { djvuDoc, numPages } = await loadDjvuDocument(blob);
  const payload: EnrichmentPayload = { pageCount: numPages };
  try {
    const page = djvuDoc.pages[0];
    if (page) {
      page.init();
      const img = page.getImageData();
      const src = document.createElement('canvas');
      src.width = img.width;
      src.height = img.height;
      src.getContext('2d')?.putImageData(img, 0, 0);
      const scale = THUMBNAIL_WIDTH / img.width;
      const out = document.createElement('canvas');
      out.width = THUMBNAIL_WIDTH;
      out.height = Math.ceil(img.height * scale);
      const ctx = out.getContext('2d');
      if (ctx) {
        ctx.drawImage(src, 0, 0, out.width, out.height);
        payload.thumbnail = canvasToJpeg(out);
      }
    }
  } catch {
    /* thumbnail is optional */
  }
  return payload;
}

/** Fetch, parse and enrich one attachment. Returns the updated record. */
export async function enrichAttachment(meta: AttachmentMeta): Promise<AttachmentMeta> {
  const blob = await attachmentStorage.getBlob(meta.id);
  if (!blob) throw new Error('blob unavailable');

  let payload: EnrichmentPayload;
  if (isDjvuBlob(blob, meta.filename)) {
    payload = await payloadFromDjvu(blob);
  } else if (isPdf(meta)) {
    const data = await blob.arrayBuffer();
    const doc = await pdfjsLib.getDocument({
      data,
      wasmUrl: `${import.meta.env.BASE_URL}pdf-wasm/`,
    }).promise;
    try {
      payload = await payloadFromPdf(doc);
    } finally {
      doc.destroy();
    }
  } else {
    payload = {};
  }
  return attachmentStorage.enrich(meta.id, payload);
}

/** Viewer path: the document is already open, so reuse it instead of re-fetching. */
export async function enrichFromOpenPdf(attachmentId: string, doc: PDFDocumentProxy): Promise<void> {
  try {
    const meta = await attachmentStorage.get(attachmentId);
    if (!meta || !needsEnrichment(meta)) return;
    const payload = await payloadFromPdf(doc);
    await attachmentStorage.enrich(attachmentId, payload);
  } catch (err) {
    console.warn('Enrichment from open document failed:', err);
  }
}

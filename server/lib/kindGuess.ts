// Heuristic classification of an attachment into a library "kind". Runs at
// upload (filename only) and again after client-side enrichment supplies the
// page count and PDF metadata. The result is only a default: a manual kind
// (kind_manual = 1) is never overwritten.

export const ATTACHMENT_KINDS = ['book', 'paper', 'draft', 'notes', 'other'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export function isAttachmentKind(value: unknown): value is AttachmentKind {
  return typeof value === 'string' && (ATTACHMENT_KINDS as readonly string[]).includes(value);
}

export interface KindSignals {
  filename: string;
  pageCount?: number | null;
  title?: string | null;
  authors?: string | null;
  /** PDF /Creator and /Producer strings, when known. */
  creator?: string | null;
  producer?: string | null;
}

const ARXIV_ID = /(^|[^\d])\d{4}\.\d{4,5}(v\d+)?([^\d]|$)/;
const SLIDES = /\b(slides?|lecture\s*\d|beamer|talk|seminar)\b/i;
const DRAFT = /\b(draft|wip|working[_ -]?(paper|draft)|v\d+[_-]?draft)\b/i;
const NOTES = /\b(notes?|lecture[_ -]?notes|summary|cheat[_ -]?sheet|handout)\b/i;
const PAPER_WORDS = /\b(et[_ ]al|proceedings|arxiv|preprint|journal|conference|icml|neurips|nips|iclr|cvpr|acl|emnlp|siam|ieee)\b/i;
const BOOK_WORDS = /\b(handbook|textbook|introduction to|principles of|elements of|foundations of|edition|\d(st|nd|rd|th)[_ -]?ed)\b/i;

function isLatexProduced(s: KindSignals): boolean {
  const meta = `${s.creator ?? ''} ${s.producer ?? ''}`.toLowerCase();
  return /tex|latex|xetex|luatex|dvips|pdftex/.test(meta);
}

/** snake_case / kebab-case filename without spaces — typical of a self-compiled LaTeX build. */
function looksSelfCompiled(filename: string): boolean {
  const base = filename.replace(/\.[^.]+$/, '');
  return !/\s/.test(base) && /[_-]/.test(base) && base === base.toLowerCase();
}

export function guessKind(s: KindSignals): AttachmentKind | null {
  const name = s.filename.replace(/[_-]+/g, ' ');
  const haystack = `${name} ${s.title ?? ''}`;
  const pages = s.pageCount ?? null;

  // Strong filename signals first.
  if (SLIDES.test(haystack)) return 'notes';
  if (DRAFT.test(haystack)) return 'draft';
  if (NOTES.test(haystack) && (pages === null || pages < 150)) return 'notes';
  if (ARXIV_ID.test(s.filename)) return 'paper';

  // Without a page count, title words are all we have.
  if (pages === null) {
    if (PAPER_WORDS.test(haystack)) return 'paper';
    if (BOOK_WORDS.test(haystack)) return 'book';
    return null;
  }

  // Length is the most reliable signal; words only break ties in the middle.
  if (pages >= 120) return 'book';
  if (pages <= 60) {
    // Own LaTeX output: no spaces in the filename, lowercase, TeX-produced, no metadata title.
    if (isLatexProduced(s) && looksSelfCompiled(s.filename) && !s.title) return 'draft';
    return 'paper';
  }
  if (PAPER_WORDS.test(haystack)) return 'paper';
  if (BOOK_WORDS.test(haystack)) return 'book';
  // 61–119 pages: long survey / lecture notes / thin monograph.
  return isLatexProduced(s) ? 'paper' : 'book';
}

/** Pull a four-digit year out of a PDF date string like "D:20210415..." or an ISO date. */
export function yearFromPdfDate(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /(?:D:)?(\d{4})/.exec(raw);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return y >= 1800 && y <= 2100 ? y : null;
}

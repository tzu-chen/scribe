import type { AttachmentKind, AttachmentMeta } from '../../types/attachment';
import { ATTACHMENT_KINDS } from '../../types/attachment';
import type { Folder } from '../../types/folder';
import type { BookTag } from '../../types/bookTag';
import type { Activity } from '../../utils/libraryActivity';
import { ACTIVITY_ORDER, displayTitle, getActivity } from '../../utils/libraryActivity';

/** What the main pane shows. Folders are labelled "projects" in the UI. */
export type Selection =
  | { kind: 'home' }
  | { kind: 'all' }
  | { kind: 'folder'; id: string }
  | { kind: 'tag'; id: string }
  | { kind: 'source'; id: string };

export type KindFilter = AttachmentKind | 'unsorted' | null;
export type ActivityFilter = Activity | null;

export interface LibraryFilters {
  kind: KindFilter;
  activity: ActivityFilter;
}

export type ViewMode = 'grid' | 'list';
export type SortField = 'name' | 'kind' | 'uploaded' | 'lastOpened' | 'progress';
export type SortDir = 'asc' | 'desc';

// --- URL state -------------------------------------------------------------
// /?                → home
// /?view=browse     → everything
// /?project=<id>    → one project     /?tag=<id> → one tag
// /?source=<id>     → one linked folder
// &kind=paper|unsorted  &activity=reading   (filters, browse only)

export function selectionFromParams(p: URLSearchParams): Selection {
  const project = p.get('project');
  if (project) return { kind: 'folder', id: project };
  const tag = p.get('tag');
  if (tag) return { kind: 'tag', id: tag };
  const source = p.get('source');
  if (source) return { kind: 'source', id: source };
  if (p.get('view') === 'browse') return { kind: 'all' };
  return { kind: 'home' };
}

export function filtersFromParams(p: URLSearchParams): LibraryFilters {
  const kindRaw = p.get('kind');
  const kind: KindFilter =
    kindRaw === 'unsorted' || (ATTACHMENT_KINDS as string[]).includes(kindRaw ?? '')
      ? (kindRaw as KindFilter)
      : null;
  const actRaw = p.get('activity');
  const activity: ActivityFilter = (ACTIVITY_ORDER as string[]).includes(actRaw ?? '') ? (actRaw as Activity) : null;
  return { kind, activity };
}

export function paramsFor(selection: Selection, filters: LibraryFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (selection.kind === 'home') return p;
  if (selection.kind === 'all') p.set('view', 'browse');
  if (selection.kind === 'folder') p.set('project', selection.id);
  if (selection.kind === 'tag') p.set('tag', selection.id);
  if (selection.kind === 'source') p.set('source', selection.id);
  if (filters.kind) p.set('kind', filters.kind);
  if (filters.activity) p.set('activity', filters.activity);
  return p;
}

export function sameSelection(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'folder' || a.kind === 'tag' || a.kind === 'source') return a.id === (b as { id: string }).id;
  return true;
}

// --- Filtering -------------------------------------------------------------

export function matchesSelection(book: AttachmentMeta, selection: Selection): boolean {
  switch (selection.kind) {
    case 'folder':
      return book.folderIds.includes(selection.id);
    case 'tag':
      return (book.tags ?? []).includes(selection.id);
    case 'source':
      return book.sourceId === selection.id;
    default:
      return true;
  }
}

export function matchesKind(book: AttachmentMeta, kind: KindFilter): boolean {
  if (kind === null) return true;
  if (kind === 'unsorted') return !book.kind;
  return book.kind === kind;
}

export function matchesActivity(book: AttachmentMeta, activity: ActivityFilter, now: number): boolean {
  return activity === null || getActivity(book, now) === activity;
}

/** Search across title, filename, linked path, authors, and the *names* of tags and projects. */
export function matchesQuery(
  book: AttachmentMeta,
  query: string,
  tagsById: Map<string, BookTag>,
  foldersById: Map<string, Folder>,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const terms = q.split(/\s+/);
  const hay = [
    displayTitle(book),
    book.filename,
    book.relPath ?? '',
    book.authors ?? '',
    book.year ? String(book.year) : '',
    ...(book.tags ?? []).map(id => tagsById.get(id)?.name ?? ''),
    ...book.folderIds.map(id => foldersById.get(id)?.name ?? ''),
  ]
    .join(' ')
    .toLowerCase();
  return terms.every(t => hay.includes(t));
}

export function countByKind(books: AttachmentMeta[]): Map<KindFilter, number> {
  const m = new Map<KindFilter, number>();
  for (const b of books) {
    const k: KindFilter = b.kind ?? 'unsorted';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function countByActivity(books: AttachmentMeta[], now: number): Map<Activity, number> {
  const m = new Map<Activity, number>();
  for (const b of books) {
    const a = getActivity(b, now);
    m.set(a, (m.get(a) ?? 0) + 1);
  }
  return m;
}

export const KIND_ORDER: AttachmentKind[] = ['book', 'paper', 'draft', 'notes', 'other'];

const kindRank = (k: AttachmentKind | undefined) => (k ? KIND_ORDER.indexOf(k) : KIND_ORDER.length);

export function compareBooks(a: AttachmentMeta, b: AttachmentMeta, field: SortField, dir: SortDir): number {
  let cmp = 0;
  switch (field) {
    case 'name':
      cmp = displayTitle(a).localeCompare(displayTitle(b), undefined, { sensitivity: 'base' });
      break;
    case 'kind':
      cmp = kindRank(a.kind) - kindRank(b.kind) || displayTitle(a).localeCompare(displayTitle(b));
      break;
    case 'uploaded':
      cmp = a.createdAt.localeCompare(b.createdAt);
      break;
    case 'lastOpened':
      cmp = (a.lastOpenedAt ?? '').localeCompare(b.lastOpenedAt ?? '');
      break;
    case 'progress': {
      const pa = a.pageCount && a.currentPage ? a.currentPage / a.pageCount : -1;
      const pb = b.pageCount && b.currentPage ? b.currentPage / b.pageCount : -1;
      cmp = pa - pb;
      break;
    }
  }
  return dir === 'asc' ? cmp : -cmp;
}

export const byLastOpenedDesc = (a: AttachmentMeta, b: AttachmentMeta) =>
  (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? '') || b.createdAt.localeCompare(a.createdAt);

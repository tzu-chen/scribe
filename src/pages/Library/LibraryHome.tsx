import { useMemo, useState, useRef, useEffect, type DragEvent } from 'react';
import { BookCover } from '../../components/BookCover/BookCover';
import type { AttachmentKind, AttachmentMeta } from '../../types/attachment';
import { KIND_LABELS } from '../../types/attachment';
import type { Folder } from '../../types/folder';
import {
  displayTitle,
  formatRelativeDate,
  getProgress,
  isContinueCandidate,
} from '../../utils/libraryActivity';
import { useNow } from '../../hooks/useNow';
import type { LibraryFilters, Selection } from './libraryModel';
import { KIND_ORDER, byLastOpenedDesc } from './libraryModel';
import styles from './LibraryHome.module.css';

interface Props {
  books: AttachmentMeta[];
  folders: Folder[];
  onOpen: (book: AttachmentMeta, newTab?: boolean) => void;
  onBrowse: (selection: Selection, filters?: Partial<LibraryFilters>) => void;
  onCreateProject: (name: string) => Promise<void>;
  onDropFiles: (files: File[], folderId: string | null) => void;
  onContextMenu: (e: React.MouseEvent, book: AttachmentMeta) => void;
}

const SHELF_LIMIT = 12;
const RECENT_DAYS = 30;

function filesFromDrop(e: DragEvent): File[] {
  return Array.from(e.dataTransfer?.files ?? []);
}

export function LibraryHome({ books, folders, onOpen, onBrowse, onCreateProject, onDropFiles, onContextMenu }: Props) {
  const now = useNow();

  const continueReading = useMemo(
    () => books.filter(b => isContinueCandidate(b, now)).sort(byLastOpenedDesc).slice(0, SHELF_LIMIT),
    [books, now],
  );

  const recentlyAdded = useMemo(() => {
    const cutoff = now - RECENT_DAYS * 86_400_000;
    return books
      .filter(b => new Date(b.createdAt).getTime() >= cutoff)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, SHELF_LIMIT);
  }, [books, now]);

  const byKind = useMemo(() => {
    const m = new Map<AttachmentKind | 'unsorted', AttachmentMeta[]>();
    for (const b of books) {
      const k = b.kind ?? 'unsorted';
      const list = m.get(k) ?? [];
      list.push(b);
      m.set(k, list);
    }
    for (const list of m.values()) list.sort(byLastOpenedDesc);
    return m;
  }, [books]);

  const projectStats = useMemo(() => {
    const m = new Map<string, { count: number; lastActive?: string; covers: AttachmentMeta[] }>();
    for (const f of folders) m.set(f.id, { count: 0, covers: [] });
    const sorted = [...books].sort(byLastOpenedDesc);
    for (const b of sorted) {
      for (const id of b.folderIds) {
        const s = m.get(id);
        if (!s) continue;
        s.count += 1;
        if (b.lastOpenedAt && (!s.lastActive || b.lastOpenedAt > s.lastActive)) s.lastActive = b.lastOpenedAt;
        if (s.covers.length < 3) s.covers.push(b);
      }
    }
    return m;
  }, [books, folders]);

  const activeProjects = useMemo(
    () =>
      folders
        .filter(f => !f.archivedAt)
        .sort((a, b) => (projectStats.get(b.id)?.lastActive ?? '').localeCompare(projectStats.get(a.id)?.lastActive ?? '') || a.name.localeCompare(b.name)),
    [folders, projectStats],
  );
  const archivedCount = folders.length - activeProjects.length;

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (creating) inputRef.current?.focus(); }, [creating]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const commitCreate = async () => {
    const name = newName.trim();
    setCreating(false);
    setNewName('');
    if (name) await onCreateProject(name);
  };

  const renderShelf = (items: AttachmentMeta[], withProgress: boolean) => (
    <div className={styles.shelf}>
      {items.map(book => (
        <button
          key={book.id}
          type="button"
          className={styles.shelfItem}
          onClick={() => onOpen(book)}
          onAuxClick={e => { if (e.button === 1) onOpen(book, true); }}
          onContextMenu={e => onContextMenu(e, book)}
          title={displayTitle(book)}
        >
          <BookCover book={book} size="lg" showProgress={withProgress} />
          <span className={styles.shelfTitle}>{displayTitle(book)}</span>
          <span className={styles.shelfMeta}>
            {withProgress && getProgress(book) !== null
              ? `${Math.round((getProgress(book) ?? 0) * 100)}% · ${formatRelativeDate(book.lastOpenedAt, now)}`
              : book.authors
                ? book.authors
                : book.year
                  ? String(book.year)
                  : formatRelativeDate(book.lastOpenedAt, now) === 'never'
                    ? 'Unopened'
                    : `Opened ${formatRelativeDate(book.lastOpenedAt, now)}`}
          </span>
        </button>
      ))}
    </div>
  );

  const sectionHeader = (title: string, count: number, onSeeAll?: () => void) => (
    <div className={styles.sectionHeader}>
      <h2 className={styles.sectionTitle}>
        {title}
        <span className={styles.sectionCount}>{count}</span>
      </h2>
      {onSeeAll && (
        <button type="button" className={styles.seeAll} onClick={onSeeAll}>
          See all →
        </button>
      )}
    </div>
  );

  if (books.length === 0) {
    return (
      <div className={styles.emptyHome}>
        <p className={styles.emptyTitle}>Your library is empty</p>
        <p className={styles.emptyText}>Upload a PDF, or drop files anywhere on this page.</p>
      </div>
    );
  }

  return (
    <div className={styles.home}>
      {continueReading.length > 0 && (
        <section className={styles.section}>
          {sectionHeader('Continue reading', continueReading.length, () => onBrowse({ kind: 'all' }, { activity: 'reading' }))}
          {renderShelf(continueReading, true)}
        </section>
      )}

      <section className={styles.section}>
        {sectionHeader('Projects', activeProjects.length)}
        <div className={styles.projectGrid}>
          {activeProjects.map(f => {
            const s = projectStats.get(f.id);
            return (
              <button
                key={f.id}
                type="button"
                className={`${styles.projectCard} ${dropTarget === f.id ? styles.projectCardDrop : ''}`}
                onClick={() => onBrowse({ kind: 'folder', id: f.id })}
                onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); setDropTarget(f.id); } }}
                onDragLeave={() => setDropTarget(t => (t === f.id ? null : t))}
                onDrop={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropTarget(null);
                  const files = filesFromDrop(e);
                  if (files.length) onDropFiles(files, f.id);
                }}
              >
                <div className={styles.projectCovers}>
                  {(s?.covers ?? []).map(b => (
                    <BookCover key={b.id} book={b} size="sm" className={styles.projectCover} />
                  ))}
                  {(s?.covers.length ?? 0) === 0 && <span className={styles.projectCoverEmpty} />}
                </div>
                <div className={styles.projectBody}>
                  <span className={styles.projectName}>{f.name}</span>
                  <span className={styles.projectMeta}>
                    {s?.count ?? 0} item{(s?.count ?? 0) === 1 ? '' : 's'}
                    {s?.lastActive ? ` · active ${formatRelativeDate(s.lastActive, now)}` : ''}
                  </span>
                </div>
              </button>
            );
          })}
          {creating ? (
            <div className={`${styles.projectCard} ${styles.projectCardNew}`}>
              <input
                ref={inputRef}
                className={styles.projectInput}
                placeholder="Project name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitCreate();
                  if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                }}
                onBlur={commitCreate}
              />
            </div>
          ) : (
            <button type="button" className={`${styles.projectCard} ${styles.projectCardNew}`} onClick={() => setCreating(true)}>
              + New project
            </button>
          )}
        </div>
        {archivedCount > 0 && (
          <p className={styles.archivedNote}>{archivedCount} archived project{archivedCount === 1 ? '' : 's'} in the sidebar.</p>
        )}
      </section>

      {recentlyAdded.length > 0 && (
        <section className={styles.section}>
          {sectionHeader('Recently added', recentlyAdded.length, () => onBrowse({ kind: 'all' }))}
          {renderShelf(recentlyAdded, false)}
        </section>
      )}

      {[...KIND_ORDER, 'unsorted' as const].map(k => {
        const items = byKind.get(k);
        if (!items || items.length === 0) return null;
        const label = k === 'unsorted' ? 'Unsorted' : KIND_LABELS[k].plural;
        return (
          <section key={k} className={styles.section}>
            {sectionHeader(label, items.length, () => onBrowse({ kind: 'all' }, { kind: k }))}
            {renderShelf(items.slice(0, SHELF_LIMIT), false)}
          </section>
        );
      })}
    </div>
  );
}

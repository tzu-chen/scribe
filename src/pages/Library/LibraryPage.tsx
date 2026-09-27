import { useState, useEffect, useCallback, useRef, useMemo, type DragEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SearchBar } from '../../components/SearchBar/SearchBar';
import { ContextMenu } from '../../components/ContextMenu/ContextMenu';
import type { ContextMenuItem } from '../../components/ContextMenu/ContextMenu';
import { AssignPopup } from '../../components/AssignPopup/AssignPopup';
import { BookCover } from '../../components/BookCover/BookCover';
import { attachmentStorage, DuplicateAttachmentError } from '../../services/attachmentStorage';
import { folderStorage } from '../../services/folderStorage';
import { bookTagStorage } from '../../services/bookTagStorage';
import { flowchartStorage } from '../../services/flowchartStorage';
import { sourceStorage } from '../../services/sourceStorage';
import type { AttachmentKind, AttachmentMeta } from '../../types/attachment';
import { ATTACHMENT_KINDS, KIND_LABELS } from '../../types/attachment';
import type { Folder } from '../../types/folder';
import type { BookTag } from '../../types/bookTag';
import type { Source } from '../../types/source';
import type { FlowchartNodeWithFlowchart } from '../../types/flowchart';
import { ChevronUpIcon, ChevronDownIcon } from '../../components/Icons/Icons';
import { displayTitle, formatRelativeDate, getActivity, getProgress, ACTIVITY_LABELS } from '../../utils/libraryActivity';
import { LibrarySidebar } from './LibrarySidebar';
import { LibraryHome } from './LibraryHome';
import { LibraryFilterBar } from './LibraryFilterBar';
import { UploadTriage } from './UploadTriage';
import { useLibraryEnrichment } from './useLibraryEnrichment';
import { useListColumns } from './useListColumns';
import type { ListColumn } from './useListColumns';
import { useNow } from '../../hooks/useNow';
import {
  type Selection,
  type LibraryFilters,
  type ViewMode,
  type SortField,
  type SortDir,
  selectionFromParams,
  filtersFromParams,
  paramsFor,
  matchesSelection,
  matchesKind,
  matchesActivity,
  matchesQuery,
  countByKind,
  countByActivity,
  compareBooks,
} from './libraryModel';
import styles from './LibraryPage.module.css';

const VIEW_MODE_KEY = 'scribe_library_view';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function isFileDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

export function LibraryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [books, setBooks] = useState<AttachmentMeta[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<BookTag[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [nodes, setNodes] = useState<FlowchartNodeWithFlowchart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Selection + filters live in the URL so "back" from the viewer restores the view.
  const selection = useMemo(() => selectionFromParams(searchParams), [searchParams]);
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const isHome = selection.kind === 'home';

  const setView = useCallback((sel: Selection, f: LibraryFilters = filters) => {
    setSearchParams(paramsFor(sel, f));
  }, [filters, setSearchParams]);
  const setFilters = useCallback((f: LibraryFilters) => setView(selection, f), [selection, setView]);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return saved === 'list' ? 'list' : 'grid';
  });
  const [sortField, setSortField] = useState<SortField>('lastOpened');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const listColumns = useListColumns();

  // Selection state (always-on, no select mode)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Context menus
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; book: AttachmentMeta } | null>(null);
  const [kindMenu, setKindMenu] = useState<{ x: number; y: number; bookIds: string[] } | null>(null);
  const [projectMenu, setProjectMenu] = useState<{ x: number; y: number; bookIds: string[] } | null>(null);
  const [showAssign, setShowAssign] = useState(false);

  // Items uploaded this session that have not been dismissed from the triage strip.
  const [triageIds, setTriageIds] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  const loadBooks = useCallback(async () => {
    try {
      setError(null);
      const all = await attachmentStorage.getAll();
      setBooks(all);
    } catch (err) {
      console.error('Failed to load books:', err);
      setError('Failed to load library. Make sure the server is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFolders = useCallback(async () => {
    try { setFolders(await folderStorage.getAll()); } catch (err) { console.error('Failed to load folders:', err); }
  }, []);
  const loadTags = useCallback(async () => {
    try { setTags(await bookTagStorage.getAll()); } catch (err) { console.error('Failed to load tags:', err); }
  }, []);
  const loadNodes = useCallback(async () => {
    try { setNodes(await flowchartStorage.getAllNodes()); } catch (err) { console.error('Failed to load flowchart nodes:', err); }
  }, []);
  const loadSources = useCallback(async () => {
    try { setSources(await sourceStorage.getAll()); } catch (err) { console.error('Failed to load linked folders:', err); }
  }, []);

  useEffect(() => {
    loadBooks();
    loadFolders();
    loadTags();
    loadNodes();
    loadSources();
  }, [loadBooks, loadFolders, loadTags, loadNodes, loadSources]);

  // Linked folders: the server watches them and pushes an event on any change;
  // opening the Library also asks for a catch-up scan, for changes a watcher
  // cannot see (network mounts, a folder that came back online).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { loadBooks(); loadSources(); }, 250);
    };
    const unsubscribe = sourceStorage.subscribe(reload);
    sourceStorage.scanAll().then(r => { if (r.changed) reload(); }).catch(() => {});
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [loadBooks, loadSources]);

  useEffect(() => { localStorage.setItem(VIEW_MODE_KEY, viewMode); }, [viewMode]);

  // Background metadata/thumbnail back-fill. Each result is merged in place so
  // covers appear progressively without a full reload.
  const patchBook = useCallback((meta: AttachmentMeta) => {
    setBooks(prev => prev.map(b => (b.id === meta.id ? meta : b)));
  }, []);
  const enrichment = useLibraryEnrichment(books, patchBook);

  // '/' focuses the search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      const input = searchInputRef.current;
      if (!input) return;
      e.preventDefault();
      input.focus();
      input.select();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  // Typing a search while on Home jumps to Browse so results have somewhere to show.
  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q);
    if (q && isHome) setView({ kind: 'all' });
  }, [isHome, setView]);

  // --- Upload ---------------------------------------------------------------
  const uploadFiles = useCallback(async (files: File[], folderId: string | null) => {
    if (files.length === 0) return;
    const uploadedIds: string[] = [];
    const duplicates: Array<{ filename: string; existing: string }> = [];
    for (const file of files) {
      try {
        const created = await attachmentStorage.add('', file, folderId);
        uploadedIds.push(created.id);
      } catch (err) {
        if (err instanceof DuplicateAttachmentError) {
          duplicates.push({ filename: file.name, existing: err.existing.filename });
        } else {
          console.error('Upload failed:', err);
          alert(`Upload failed for ${file.name}`);
        }
      }
    }
    if (selection.kind === 'tag' && uploadedIds.length > 0) {
      await Promise.all(uploadedIds.map(id => attachmentStorage.setTags(id, [selection.id])));
    }
    setTriageIds(prev => [...uploadedIds.reverse(), ...prev]);
    await loadBooks();
    if (duplicates.length > 0) {
      const lines = duplicates.map(d =>
        d.filename === d.existing ? `• ${d.filename}` : `• ${d.filename} (already in library as "${d.existing}")`,
      );
      const header = duplicates.length === 1 ? 'Skipped 1 duplicate:' : `Skipped ${duplicates.length} duplicates:`;
      alert(`${header}\n\n${lines.join('\n')}`);
    }
  }, [loadBooks, selection]);

  const handleUploadInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    await uploadFiles(files, selection.kind === 'folder' ? selection.id : null);
  }, [uploadFiles, selection]);

  const handlePageDragOver = useCallback((e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setDragging(true);
  }, []);
  const handlePageDragLeave = useCallback((e: DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  }, []);
  const handlePageDrop = useCallback((e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    void uploadFiles(files, selection.kind === 'folder' ? selection.id : null);
  }, [uploadFiles, selection]);

  // --- Open / delete / rename --------------------------------------------------
  const sourcesById = useMemo(() => new Map(sources.map(s => [s.id, s])), [sources]);
  /** Linked file that can't be opened right now: gone from disk, or its folder is offline. */
  const isUnavailable = useCallback(
    (book: AttachmentMeta) => !!book.missing || (!!book.sourceId && !!sourcesById.get(book.sourceId)?.offline),
    [sourcesById],
  );

  const handleOpen = useCallback((book: AttachmentMeta, openInNewTab = false) => {
    if (isUnavailable(book)) {
      const src = book.sourceId ? sourcesById.get(book.sourceId) : undefined;
      alert(src?.offline
        ? `"${src.name}" can't be reached right now (${src.path}).`
        : `This file is no longer on disk:\n${src ? `${src.path}/` : ''}${book.relPath ?? book.filename}`);
      return;
    }
    attachmentStorage.markOpened(book.id).catch(() => {});
    const isViewable = book.type === 'application/pdf'
      || book.type === 'image/vnd.djvu'
      || book.type === 'image/x-djvu'
      || book.filename.toLowerCase().endsWith('.djvu');
    if (isViewable) {
      if (openInNewTab) window.open(`/pdf/${book.id}`, '_blank', 'noopener,noreferrer');
      else navigate(`/pdf/${book.id}`);
    } else {
      attachmentStorage.openFile(book.id);
    }
  }, [navigate, isUnavailable, sourcesById]);

  // Uploads are deleted; linked items are only removed from the library (and
  // excluded from their folder so they are not re-added) — their files stay.
  const handleDelete = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const linked = ids.filter(id => books.find(b => b.id === id)?.sourceId).length;
    const n = (k: number) => (k === 1 ? '1 item' : `${k} items`);
    const msg = linked === 0
      ? `Delete ${n(ids.length)}? This cannot be undone.`
      : linked === ids.length
        ? `Remove ${n(ids.length)} from the library? The files stay on disk and won't be re-added; highlights and comments on them are deleted.`
        : `Delete ${n(ids.length - linked)} uploaded and remove ${n(linked)} linked from the library? Linked files stay on disk. This cannot be undone.`;
    if (!confirm(msg)) return;
    await Promise.all(ids.map(id => attachmentStorage.delete(id)));
    setSelectedIds(prev => { const next = new Set(prev); for (const id of ids) next.delete(id); return next; });
    setActiveId(prev => (prev && ids.includes(prev) ? null : prev));
    setAnchorId(prev => (prev && ids.includes(prev) ? null : prev));
    setTriageIds(prev => prev.filter(id => !ids.includes(id)));
    await loadBooks();
    if (linked > 0) await loadSources();
  }, [books, loadBooks, loadSources]);

  const startRename = useCallback((book: AttachmentMeta) => {
    setRenamingId(book.id);
    setRenameValue(displayTitle(book));
  }, []);

  const commitRename = useCallback(async () => {
    if (!renamingId) return;
    const book = books.find(b => b.id === renamingId);
    const trimmed = renameValue.trim();
    if (book && trimmed && trimmed !== displayTitle(book)) {
      await attachmentStorage.setTitle(renamingId, trimmed);
      await loadBooks();
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, books, loadBooks]);

  const cancelRename = useCallback(() => { setRenamingId(null); setRenameValue(''); }, []);

  const handleSort = useCallback((field: SortField, dir?: SortDir) => {
    if (dir) { setSortField(field); setSortDir(dir); return; }
    setSortField(prev => {
      if (prev === field) { setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); return prev; }
      setSortDir(field === 'name' || field === 'kind' ? 'asc' : 'desc');
      return field;
    });
  }, []);

  // --- Classification --------------------------------------------------------
  const handleSetKind = useCallback(async (bookIds: string[], kind: AttachmentKind | null) => {
    await Promise.all(bookIds.map(id => attachmentStorage.setKind(id, kind)));
    await loadBooks();
  }, [loadBooks]);

  const handleToggleProject = useCallback(async (bookIds: string[], folderId: string) => {
    const allHave = bookIds.every(id => books.find(b => b.id === id)?.folderIds.includes(folderId));
    await Promise.all(bookIds.map(async id => {
      const current = books.find(b => b.id === id)?.folderIds ?? [];
      const next = allHave ? current.filter(f => f !== folderId) : current.includes(folderId) ? current : [...current, folderId];
      await attachmentStorage.setFolders(id, next);
    }));
    await loadBooks();
  }, [books, loadBooks]);

  const handleSetDone = useCallback(async (bookIds: string[], done: boolean) => {
    await Promise.all(bookIds.map(id => attachmentStorage.setStatus(id, done ? 'done' : null)));
    await loadBooks();
  }, [loadBooks]);

  const handleToggleBookTag = useCallback(async (bookIds: string[], tagId: string) => {
    const allHave = bookIds.every(bid => books.find(b => b.id === bid)?.tags?.includes(tagId));
    await Promise.all(bookIds.map(async bid => {
      const current = books.find(b => b.id === bid)?.tags ?? [];
      const next = allHave ? current.filter(t => t !== tagId) : current.includes(tagId) ? current : [...current, tagId];
      await attachmentStorage.setTags(bid, next);
    }));
    await loadBooks();
  }, [books, loadBooks]);

  const handleRemoveBookTag = useCallback(async (bookId: string, tagId: string) => {
    const book = books.find(b => b.id === bookId);
    if (!book) return;
    await attachmentStorage.setTags(bookId, (book.tags ?? []).filter(t => t !== tagId));
    await loadBooks();
  }, [books, loadBooks]);

  const handleCreateProject = useCallback(async (name: string) => {
    const created = await folderStorage.create(name);
    await loadFolders();
    setView({ kind: 'folder', id: created.id });
  }, [loadFolders, setView]);

  // --- Context menu ----------------------------------------------------------
  const openBookContextMenu = useCallback((e: React.MouseEvent, book: AttachmentMeta) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, book });
    setKindMenu(null);
    setProjectMenu(null);
  }, []);

  // --- Derived collections --------------------------------------------------
  const tagsById = useMemo(() => new Map(tags.map(t => [t.id, t])), [tags]);
  const foldersById = useMemo(() => new Map(folders.map(f => [f.id, f])), [folders]);
  const activeFolders = useMemo(() => folders.filter(f => !f.archivedAt), [folders]);
  const now = useNow();

  // Base = selection + search; chips count within it, then kind/activity narrow it.
  const baseBooks = useMemo(
    () => books.filter(b => matchesSelection(b, selection) && matchesQuery(b, searchQuery, tagsById, foldersById)),
    [books, selection, searchQuery, tagsById, foldersById],
  );
  const kindCounts = useMemo(() => countByKind(baseBooks.filter(b => matchesActivity(b, filters.activity, now))), [baseBooks, filters.activity, now]);
  const activityCounts = useMemo(() => countByActivity(baseBooks.filter(b => matchesKind(b, filters.kind)), now), [baseBooks, filters.kind, now]);
  const filteredBooks = useMemo(
    () => baseBooks.filter(b => matchesKind(b, filters.kind) && matchesActivity(b, filters.activity, now)),
    [baseBooks, filters, now],
  );
  const sortedBooks = useMemo(
    () => [...filteredBooks].sort((a, b) => compareBooks(a, b, sortField, sortDir)),
    [filteredBooks, sortField, sortDir],
  );
  // Files gone from disk stay findable in Browse, but don't clutter the shelves.
  const homeBooks = useMemo(() => books.filter(b => !b.missing), [books]);
  const triageBooks = useMemo(
    () => triageIds.map(id => books.find(b => b.id === id)).filter((b): b is AttachmentMeta => !!b),
    [triageIds, books],
  );

  // Clear selection state when the visible set changes meaningfully.
  useEffect(() => {
    setSelectedIds(new Set());
    setActiveId(null);
    setAnchorId(null);
  }, [selection, filters, searchQuery]);

  // --- Selection helpers -----------------------------------------------------
  const rangeBetween = useCallback((fromId: string, toId: string): Set<string> => {
    const fromIdx = sortedBooks.findIndex(b => b.id === fromId);
    const toIdx = sortedBooks.findIndex(b => b.id === toId);
    if (fromIdx === -1 || toIdx === -1) return new Set([toId]);
    const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    const range = new Set<string>();
    for (let i = lo; i <= hi; i++) range.add(sortedBooks[i].id);
    return range;
  }, [sortedBooks]);

  const scrollIntoView = useCallback((id: string) => {
    cardRefs.current.get(id)?.scrollIntoView({ block: 'nearest' });
  }, []);

  const handleCardClick = useCallback((book: AttachmentMeta, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, button, select, textarea')) return;
    if (e.shiftKey && anchorId !== null) {
      setSelectedIds(rangeBetween(anchorId, book.id));
      setActiveId(book.id);
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedIds(prev => { const next = new Set(prev); if (next.has(book.id)) next.delete(book.id); else next.add(book.id); return next; });
      setActiveId(book.id);
      setAnchorId(book.id);
    } else {
      setSelectedIds(new Set([book.id]));
      setActiveId(book.id);
      setAnchorId(book.id);
    }
  }, [anchorId, rangeBetween]);

  const handleCardDoubleClick = useCallback((book: AttachmentMeta, e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, button, select, textarea')) return;
    handleOpen(book);
  }, [handleOpen]);

  // Keyboard navigation (browse only): arrows move, shift extends, enter opens,
  // delete removes, escape clears, 'a' opens the assign popup.
  useEffect(() => {
    if (isHome) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      if (sortedBooks.length === 0) return;
      const horizontal = viewMode === 'grid';
      const isNext = e.key === 'ArrowDown' || (horizontal && e.key === 'ArrowRight');
      const isPrev = e.key === 'ArrowUp' || (horizontal && e.key === 'ArrowLeft');

      if (isNext || isPrev) {
        e.preventDefault();
        let newActiveId: string;
        const currentIdx = activeId === null ? -1 : sortedBooks.findIndex(b => b.id === activeId);
        if (currentIdx === -1) {
          newActiveId = sortedBooks[0].id;
        } else {
          const nextIdx = Math.max(0, Math.min(sortedBooks.length - 1, currentIdx + (isNext ? 1 : -1)));
          newActiveId = sortedBooks[nextIdx].id;
        }
        if (e.shiftKey && anchorId !== null) {
          setSelectedIds(rangeBetween(anchorId, newActiveId));
          setActiveId(newActiveId);
        } else {
          setSelectedIds(new Set([newActiveId]));
          setActiveId(newActiveId);
          setAnchorId(newActiveId);
        }
        scrollIntoView(newActiveId);
      } else if (e.key === 'Enter') {
        if (selectedIds.size === 1) {
          const book = books.find(b => b.id === Array.from(selectedIds)[0]);
          if (book) { e.preventDefault(); handleOpen(book); }
        }
      } else if (e.key === 'Escape') {
        if (selectedIds.size > 0) { setSelectedIds(new Set()); setActiveId(null); setAnchorId(null); }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.size === 0) return;
        e.preventDefault();
        handleDelete(Array.from(selectedIds));
      } else if ((e.key === 'a' || e.key === 'A') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (selectedIds.size === 0) return;
        e.preventDefault();
        setShowAssign(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isHome, viewMode, sortedBooks, activeId, anchorId, selectedIds, books, handleOpen, handleDelete, rangeBetween, scrollIntoView]);

  // --- Chips -----------------------------------------------------------------
  const renderNodeChips = (book: AttachmentMeta) => {
    const links = book.nodeAttachments ?? [];
    if (links.length === 0) return null;
    return (
      <span className={styles.nodeChip}>
        <span className={styles.nodeChipLabel}>{links.length} {links.length === 1 ? 'node' : 'nodes'}</span>
        <span className={styles.nodeChipTooltip} role="tooltip">
          {links.map(link => (
            <span key={`${link.flowchartId}:${link.nodeKey}`} className={styles.nodeChipTooltipRow}>
              <span className={styles.nodeChipTooltipNode}>{link.title}</span>
              <span className={styles.nodeChipTooltipFlowchart}>{link.flowchartName}</span>
            </span>
          ))}
        </span>
      </span>
    );
  };

  const renderTagChips = (book: AttachmentMeta) => {
    if (!book.tags || book.tags.length === 0) return null;
    return (
      <span className={styles.tagChipRow}>
        {book.tags.map(tid => {
          const tag = tagsById.get(tid);
          if (!tag) return null;
          return (
            <span
              key={tid}
              className={styles.tagChip}
              style={tag.color ? { backgroundColor: tag.color, color: 'var(--color-on-solid)' } : undefined}
              onClick={e => e.stopPropagation()}
              onDoubleClick={e => e.stopPropagation()}
            >
              {tag.name}
              <button
                type="button"
                className={styles.tagChipRemove}
                title={`Remove "${tag.name}"`}
                aria-label={`Remove ${tag.name}`}
                onClick={e => { e.stopPropagation(); handleRemoveBookTag(book.id, tid); }}
                onDoubleClick={e => e.stopPropagation()}
              >
                ×
              </button>
            </span>
          );
        })}
      </span>
    );
  };

  const renderProjectChips = (book: AttachmentMeta) => {
    const names = book.folderIds.map(id => foldersById.get(id)).filter((f): f is Folder => !!f);
    if (names.length === 0) return null;
    return (
      <span className={styles.projectChipRow}>
        {names.map(f => (
          <button
            key={f.id}
            type="button"
            className={styles.projectChip}
            onClick={e => { e.stopPropagation(); setView({ kind: 'folder', id: f.id }); }}
            onDoubleClick={e => e.stopPropagation()}
            title={`Open project ${f.name}`}
          >
            {f.name}
          </button>
        ))}
      </span>
    );
  };

  const renderKindBadge = (book: AttachmentMeta) => (
    <span className={`${styles.kindBadge} ${book.kind ? styles[`kind_${book.kind}`] : styles.kindUnsorted} ${book.kind && !book.kindManual ? styles.kindGuess : ''}`} title={book.kind && !book.kindManual ? 'Guessed — right-click to set' : undefined}>
      {book.kind ? KIND_LABELS[book.kind].singular : 'Unsorted'}
    </span>
  );

  const renderProgress = (book: AttachmentMeta) => {
    const p = getProgress(book);
    const activity = getActivity(book, now);
    if (p === null) {
      return <span className={styles.progressText}>{ACTIVITY_LABELS[activity]}</span>;
    }
    return (
      <span className={styles.progressCell} title={`${book.currentPage ?? 0} / ${book.pageCount ?? '?'} pages`}>
        <span className={styles.progressBar}><span className={styles.progressFill} style={{ width: `${Math.round(p * 100)}%` }} /></span>
        <span className={styles.progressText}>{activity === 'done' ? 'Done' : `${Math.round(p * 100)}%`}</span>
      </span>
    );
  };

  const subtitleFor = (book: AttachmentMeta) => {
    // For linked files the subfolder tells same-titled versions apart (e.g. baseline/ snapshots).
    const dir = book.relPath?.includes('/') ? book.relPath.slice(0, book.relPath.lastIndexOf('/') + 1) : null;
    const bits = [dir, book.authors, book.year ? String(book.year) : null, book.pageCount ? `${book.pageCount} pp` : null].filter(Boolean);
    return bits.join(' · ');
  };

  const renderUnavailableTag = (book: AttachmentMeta) =>
    isUnavailable(book) ? <span className={styles.unavailableTag}>{book.missing ? 'Missing' : 'Offline'}</span> : null;

  // Right-click acts on the selection when the clicked item is part of it.
  const contextTargetIds = useMemo(() => {
    if (!contextMenu) return [];
    return selectedIds.has(contextMenu.book.id) ? Array.from(selectedIds) : [contextMenu.book.id];
  }, [contextMenu, selectedIds]);

  const bookContextMenuItems = useMemo((): ContextMenuItem[] => {
    if (!contextMenu) return [];
    const targetIds = contextTargetIds;
    const targets = targetIds.map(id => books.find(b => b.id === id)).filter((b): b is AttachmentMeta => !!b);
    const items: ContextMenuItem[] = [];
    if (targetIds.length === 1) {
      items.push({ label: 'Open in new tab', onClick: () => handleOpen(contextMenu.book, true) });
      items.push({ label: 'Rename', onClick: () => startRename(contextMenu.book) });
    }
    items.push({ label: 'Set kind…', onClick: () => setKindMenu({ x: contextMenu.x, y: contextMenu.y, bookIds: targetIds }) });
    if (activeFolders.length > 0) {
      items.push({ label: 'Projects…', onClick: () => setProjectMenu({ x: contextMenu.x, y: contextMenu.y, bookIds: targetIds }) });
    }
    if (selection.kind === 'folder') {
      const folderId = selection.id;
      items.push({
        label: `Remove from ${foldersById.get(folderId)?.name ?? 'project'}`,
        onClick: async () => {
          await Promise.all(targets.map(b => attachmentStorage.setFolders(b.id, b.folderIds.filter(f => f !== folderId))));
          await loadBooks();
        },
      });
    }
    const allDone = targets.length > 0 && targets.every(b => b.status === 'done');
    items.push({ label: allDone ? 'Mark as not done' : 'Mark as done', onClick: () => handleSetDone(targetIds, !allDone) });
    const linkedCount = targets.filter(b => b.sourceId).length;
    const verb = linkedCount === 0 ? 'Delete' : linkedCount === targets.length ? 'Remove from library' : 'Delete / remove';
    items.push({
      label: targetIds.length === 1 ? verb : `${verb} (${targetIds.length})`,
      onClick: () => handleDelete(targetIds),
      danger: true,
    });
    return items;
  }, [contextMenu, contextTargetIds, books, activeFolders, selection, foldersById, handleOpen, startRename, handleSetDone, handleDelete, loadBooks]);

  const kindMenuItems = useMemo((): ContextMenuItem[] => {
    if (!kindMenu) return [];
    const targets = kindMenu.bookIds.map(id => books.find(b => b.id === id)).filter((b): b is AttachmentMeta => !!b);
    const common = <T,>(pick: (b: AttachmentMeta) => T | undefined): T | undefined => {
      const v = targets.map(pick);
      return v.every(x => x === v[0]) ? v[0] : undefined;
    };
    const currentKind = common(b => b.kind);
    const currentManual = common(b => (b.kindManual ? 'y' : 'n'));
    const items: ContextMenuItem[] = ATTACHMENT_KINDS.map(k => ({
      label: KIND_LABELS[k].singular,
      checked: currentKind === k && currentManual === 'y',
      onClick: () => handleSetKind(kindMenu.bookIds, k),
    }));
    items.push({
      label: currentKind && currentManual === 'n' ? `Automatic (${KIND_LABELS[currentKind].singular})` : 'Automatic',
      checked: currentManual === 'n',
      onClick: () => handleSetKind(kindMenu.bookIds, null),
    });
    return items;
  }, [kindMenu, books, handleSetKind]);

  const projectMenuItems = useMemo((): ContextMenuItem[] => {
    if (!projectMenu) return [];
    return activeFolders.map(f => ({
      label: f.name,
      checked: projectMenu.bookIds.every(id => books.find(b => b.id === id)?.folderIds.includes(f.id)),
      keepOpen: true,
      onClick: () => handleToggleProject(projectMenu.bookIds, f.id),
    }));
  }, [projectMenu, activeFolders, books, handleToggleProject]);

  // --- Render ------------------------------------------------------------------
  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>Loading library...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Connection error</p>
          <p className={styles.emptyText}>{error}</p>
          <button className={styles.uploadButton} onClick={loadBooks}>Retry</button>
        </div>
      </div>
    );
  }

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return <span className={styles.sortArrow}>{sortDir === 'asc' ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}</span>;
  };

  const colResizer = (col: ListColumn) => (
    <span
      className={styles.colResizer}
      onPointerDown={e => listColumns.startResize(col, e)}
      onDoubleClick={() => listColumns.resetWidth(col)}
      title="Drag to resize · double-click to reset"
      aria-hidden="true"
    />
  );

  const headingFor = (): string => {
    switch (selection.kind) {
      case 'home': return 'Library';
      case 'all': return 'All items';
      case 'folder': return foldersById.get(selection.id)?.name ?? 'Project';
      case 'tag': return tagsById.get(selection.id)?.name ?? 'Tag';
      case 'source': return sourcesById.get(selection.id)?.name ?? 'Linked folder';
    }
  };
  const selectedSource = selection.kind === 'source' ? sourcesById.get(selection.id) : undefined;

  const emptyState = () => {
    if (books.length === 0) {
      return (<><p className={styles.emptyTitle}>No items yet</p><p className={styles.emptyText}>Upload a PDF or drop files here to get started.</p></>);
    }
    if (baseBooks.length === 0 && selection.kind === 'folder' && !searchQuery) {
      return (<><p className={styles.emptyTitle}>This project is empty</p><p className={styles.emptyText}>Drop files here, or right-click items elsewhere and choose &quot;Projects…&quot;.</p></>);
    }
    if (baseBooks.length === 0 && selectedSource && !searchQuery) {
      if (selectedSource.offline) {
        return (<><p className={styles.emptyTitle}>Folder offline</p><p className={styles.emptyText}>{selectedSource.path} can&apos;t be reached.</p></>);
      }
      return (<><p className={styles.emptyTitle}>No documents here yet</p><p className={styles.emptyText}>PDFs added to {selectedSource.path} will appear automatically.</p></>);
    }
    if (baseBooks.length === 0 && selection.kind === 'tag' && !searchQuery) {
      return (<><p className={styles.emptyTitle}>No items with this tag</p><p className={styles.emptyText}>Select items and click the tag in the sidebar to apply it.</p></>);
    }
    return (<><p className={styles.emptyTitle}>No matching items</p><p className={styles.emptyText}>Try adjusting your search or filters.</p></>);
  };

  return (
    <div
      className={`${styles.page} ${dragging ? styles.pageDragging : ''}`}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      <div className={styles.header}>
        <h1 className={styles.title}>{headingFor()}</h1>
        {selectedSource && <span className={styles.headerPath} title={selectedSource.path}>{selectedSource.path}</span>}
        {selectedSource?.offline && <span className={styles.statusBadge} title="The folder can't be reached; its items are left as they were">Offline</span>}
        {selectedSource?.error && <span className={styles.statusBadge} title={selectedSource.error}>Scan failed</span>}
        {selectedSource && selectedSource.missingCount > 0 && (
          <span className={styles.statusBadge} title="Files gone from disk; right-click the folder to remove them">{selectedSource.missingCount} missing</span>
        )}
        {enrichment.active && enrichment.pending > 0 && (
          <span className={styles.enrichBadge} title="Reading page counts, metadata and covers from files">
            Indexing {enrichment.total - enrichment.pending + 1}/{enrichment.total}
          </span>
        )}
        <div className={styles.headerActions}>
          {!isHome && (
            <div className={styles.viewToggle}>
              <button
                className={`${styles.viewToggleBtn} ${viewMode === 'grid' ? styles.viewToggleActive : ''}`}
                onClick={() => setViewMode('grid')}
                title="Cover grid"
                aria-label="Cover grid"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="1" width="6" height="6" rx="1" />
                  <rect x="9" y="1" width="6" height="6" rx="1" />
                  <rect x="1" y="9" width="6" height="6" rx="1" />
                  <rect x="9" y="9" width="6" height="6" rx="1" />
                </svg>
              </button>
              <button
                className={`${styles.viewToggleBtn} ${viewMode === 'list' ? styles.viewToggleActive : ''}`}
                onClick={() => setViewMode('list')}
                title="List view"
                aria-label="List view"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="1" y1="3" x2="15" y2="3" />
                  <line x1="1" y1="8" x2="15" y2="8" />
                  <line x1="1" y1="13" x2="15" y2="13" />
                </svg>
              </button>
            </div>
          )}
          <button className={styles.uploadButton} onClick={() => fileInputRef.current?.click()}>
            + Upload
          </button>
          <input ref={fileInputRef} type="file" multiple className={styles.hiddenInput} onChange={handleUploadInput} />
        </div>
      </div>

      <div className={styles.layout}>
        <LibrarySidebar
          books={books}
          folders={folders}
          tags={tags}
          sources={sources}
          selection={selection}
          selectedCount={selectedIds.size}
          onSelect={sel => setView(sel)}
          onApplyTagToSelection={tag => handleToggleBookTag(Array.from(selectedIds), tag.id)}
          onFoldersChanged={loadFolders}
          onTagsChanged={loadTags}
          onSourcesChanged={loadSources}
          onBooksChanged={loadBooks}
        />

        <div className={styles.content}>
          {books.length > 0 && (
            <div className={styles.searchRow}>
              <SearchBar ref={searchInputRef} value={searchQuery} onChange={handleSearchChange} placeholder="Search titles, authors, tags, projects…" />
              {selectedIds.size > 0 && <span className={styles.selectionCount}>{selectedIds.size} selected</span>}
            </div>
          )}

          <UploadTriage
            books={triageBooks}
            folders={folders}
            tags={tags}
            onChanged={loadBooks}
            onDismiss={id => setTriageIds(prev => prev.filter(x => x !== id))}
            onDismissAll={() => setTriageIds([])}
          />

          {isHome ? (
            <LibraryHome
              books={homeBooks}
              folders={folders}
              onOpen={handleOpen}
              onBrowse={(sel, f) => setView(sel, { kind: null, activity: null, ...f })}
              onCreateProject={handleCreateProject}
              onDropFiles={uploadFiles}
              onContextMenu={openBookContextMenu}
            />
          ) : (
            <>
              {baseBooks.length > 0 && (
                <LibraryFilterBar
                  filters={filters}
                  onChange={setFilters}
                  kindCounts={kindCounts}
                  activityCounts={activityCounts}
                  total={baseBooks.filter(b => matchesActivity(b, filters.activity, now)).length}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={(f, d) => handleSort(f, d)}
                  showSort={viewMode === 'grid'}
                />
              )}

              <div className={styles.listArea}>
                {sortedBooks.length === 0 ? (
                  <div className={styles.empty}>{emptyState()}</div>
                ) : viewMode === 'grid' ? (
                  <div className={styles.grid}>
                    {sortedBooks.map(book => {
                      const isSelected = selectedIds.has(book.id);
                      const isActive = activeId === book.id;
                      return (
                        <article
                          key={book.id}
                          ref={el => { if (el) cardRefs.current.set(book.id, el); else cardRefs.current.delete(book.id); }}
                          className={`${styles.gridCard} ${isSelected ? styles.gridCardSelected : ''} ${isActive ? styles.gridCardActive : ''} ${isUnavailable(book) ? styles.unavailable : ''}`}
                          onClick={e => handleCardClick(book, e)}
                          onDoubleClick={e => handleCardDoubleClick(book, e)}
                          onAuxClick={e => { if (e.button === 1) handleOpen(book, true); }}
                          onContextMenu={e => openBookContextMenu(e, book)}
                        >
                          <BookCover book={book} size="md" showProgress />
                          <div className={styles.gridBody}>
                            {renamingId === book.id ? (
                              <input
                                ref={renameInputRef}
                                className={styles.renameInput}
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename(); }}
                                onBlur={commitRename}
                                onClick={e => e.stopPropagation()}
                              />
                            ) : (
                              <div className={styles.gridTitle} title={displayTitle(book)}>{displayTitle(book)}</div>
                            )}
                            <div className={styles.gridMeta}>
                              {renderKindBadge(book)}
                              {renderUnavailableTag(book)}
                              <span className={styles.gridMetaText} title={book.relPath}>{subtitleFor(book) || formatRelativeDate(book.lastOpenedAt, now)}</span>
                            </div>
                            {(book.tags?.length || book.nodeAttachments?.length) ? (
                              <div className={styles.gridChips}>{renderTagChips(book)}{renderNodeChips(book)}</div>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.listContainer}>
                    <table ref={listColumns.tableRef} className={styles.listTable} style={listColumns.tableStyle}>
                      <colgroup>
                        <col className={styles.colTitle} />
                        <col className={styles.colKind} />
                        <col className={styles.colProjects} />
                        <col className={styles.colTags} />
                        <col className={styles.colProgress} />
                        <col className={styles.colOpened} />
                        <col className={styles.colAdded} />
                        <col />
                      </colgroup>
                      <thead>
                        <tr className={styles.listHeaderRow}>
                          <th className={styles.listHeaderCell} onClick={() => handleSort('name')}>Title{sortIndicator('name')}{colResizer('title')}</th>
                          <th className={styles.listHeaderCell} onClick={() => handleSort('kind')}>Kind{sortIndicator('kind')}{colResizer('kind')}</th>
                          <th className={`${styles.listHeaderCell} ${styles.listHeaderStatic}`}>Projects{colResizer('projects')}</th>
                          <th className={`${styles.listHeaderCell} ${styles.listHeaderStatic}`}>Tags{colResizer('tags')}</th>
                          <th className={styles.listHeaderCell} onClick={() => handleSort('progress')}>Progress{sortIndicator('progress')}{colResizer('progress')}</th>
                          <th className={styles.listHeaderCell} onClick={() => handleSort('lastOpened')}>Opened{sortIndicator('lastOpened')}{colResizer('opened')}</th>
                          <th className={styles.listHeaderCell} onClick={() => handleSort('uploaded')}>Added{sortIndicator('uploaded')}{colResizer('added')}</th>
                          <th className={styles.listFillerCell} aria-hidden="true" />
                        </tr>
                      </thead>
                      <tbody>
                        {sortedBooks.map(book => {
                          const isSelected = selectedIds.has(book.id);
                          const isActive = activeId === book.id;
                          return (
                            <tr
                              key={book.id}
                              ref={el => { if (el) cardRefs.current.set(book.id, el); else cardRefs.current.delete(book.id); }}
                              className={`${styles.listRow} ${isSelected ? styles.listRowSelected : ''} ${isActive ? styles.listRowActive : ''} ${isUnavailable(book) ? styles.unavailable : ''}`}
                              onClick={e => handleCardClick(book, e)}
                              onDoubleClick={e => handleCardDoubleClick(book, e)}
                              onAuxClick={e => { if (e.button === 1) handleOpen(book, true); }}
                              onContextMenu={e => openBookContextMenu(e, book)}
                            >
                              <td className={styles.listNameCell}>
                                <div className={styles.listTitleWrap}>
                                  <BookCover book={book} size="sm" />
                                  <div className={styles.listTitleText}>
                                    {renamingId === book.id ? (
                                      <input
                                        ref={renameInputRef}
                                        className={styles.renameInput}
                                        value={renameValue}
                                        onChange={e => setRenameValue(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename(); }}
                                        onBlur={commitRename}
                                        onClick={e => e.stopPropagation()}
                                      />
                                    ) : (
                                      <span className={styles.listFileName} title={book.relPath ?? book.filename}>{displayTitle(book)}</span>
                                    )}
                                    <span className={styles.listSubtitle}>
                                      {renderUnavailableTag(book)}
                                      <span className={styles.listSubtitleText}>{subtitleFor(book)}</span>
                                      {renderNodeChips(book)}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className={styles.listCell}>{renderKindBadge(book)}</td>
                              <td className={`${styles.listCell} ${styles.listWrapCell}`}>{renderProjectChips(book)}</td>
                              <td className={`${styles.listCell} ${styles.listWrapCell}`}>{renderTagChips(book)}</td>
                              <td className={styles.listCell}>{renderProgress(book)}</td>
                              <td className={styles.listCell} title={book.lastOpenedAt ? formatDate(book.lastOpenedAt) : undefined}>
                                {book.lastOpenedAt ? formatRelativeDate(book.lastOpenedAt, now) : '—'}
                              </td>
                              <td className={styles.listCell}>{formatDate(book.createdAt)}</td>
                              <td className={styles.listFillerCell} />
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {dragging && (
        <div className={styles.dropOverlay} aria-hidden="true">
          <span className={styles.dropOverlayText}>
            {selection.kind === 'folder' ? `Drop to add to ${foldersById.get(selection.id)?.name ?? 'project'}` : 'Drop files to upload'}
          </span>
        </div>
      )}

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={bookContextMenuItems} onClose={() => setContextMenu(null)} />
      )}
      {kindMenu && (
        <ContextMenu x={kindMenu.x} y={kindMenu.y} items={kindMenuItems} onClose={() => setKindMenu(null)} />
      )}
      {projectMenu && (
        <ContextMenu x={projectMenu.x} y={projectMenu.y} items={projectMenuItems} onClose={() => setProjectMenu(null)} />
      )}
      {showAssign && selectedIds.size > 0 && (
        <AssignPopup
          selectedBookIds={selectedIds}
          books={books}
          folders={activeFolders}
          tags={tags}
          nodes={nodes}
          onClose={() => setShowAssign(false)}
          onApplied={loadBooks}
        />
      )}
    </div>
  );
}

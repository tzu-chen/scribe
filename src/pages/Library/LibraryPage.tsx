import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchBar } from '../../components/SearchBar/SearchBar';
import { ContextMenu } from '../../components/ContextMenu/ContextMenu';
import type { ContextMenuItem } from '../../components/ContextMenu/ContextMenu';
import { attachmentStorage } from '../../services/attachmentStorage';
import { folderStorage } from '../../services/folderStorage';
import { bookTagStorage } from '../../services/bookTagStorage';
import type { AttachmentMeta } from '../../types/attachment';
import type { Folder } from '../../types/folder';
import type { BookTag } from '../../types/bookTag';
import { ChevronUpIcon, ChevronDownIcon } from '../../components/Icons/Icons';
import { stripExtension } from '../../utils/filename';
import styles from './LibraryPage.module.css';

type ViewMode = 'card' | 'list';
type SortField = 'name' | 'uploaded' | 'lastOpened';
type SortDir = 'asc' | 'desc';

type Selection =
  | { kind: 'all' }
  | { kind: 'folder'; id: string }
  | { kind: 'tag'; id: string };

const VIEW_MODE_KEY = 'scribe_library_view';

const TAG_COLOR_PALETTE = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#84cc16',
  '#06b6d4', '#a855f7', '#facc15', '#f43f5e', '#22c55e',
];

function randomTagColor(): string {
  return TAG_COLOR_PALETTE[Math.floor(Math.random() * TAG_COLOR_PALETTE.length)];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toUpperCase() : '—';
}

export function LibraryPage() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<AttachmentMeta[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<BookTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return saved === 'list' ? 'list' : 'card';
  });
  const [sortField, setSortField] = useState<SortField>('lastOpened');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Selection state (always-on, no select mode)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Sidebar selection (mutually exclusive — only one filter active at a time)
  const [selection, setSelection] = useState<Selection>({ kind: 'all' });
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const renameFolderInputRef = useRef<HTMLInputElement>(null);

  // Tag state
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [renamingTagId, setRenamingTagId] = useState<string | null>(null);
  const [renameTagValue, setRenameTagValue] = useState('');
  const newTagInputRef = useRef<HTMLInputElement>(null);
  const renameTagInputRef = useRef<HTMLInputElement>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; book: AttachmentMeta } | null>(null);
  const [folderContextMenu, setFolderContextMenu] = useState<{ x: number; y: number; folder: Folder } | null>(null);
  const [tagContextMenu, setTagContextMenu] = useState<{ x: number; y: number; tag: BookTag } | null>(null);
  const [moveMenu, setMoveMenu] = useState<{ x: number; y: number; bookIds: string[] } | null>(null);

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
    try {
      const all = await folderStorage.getAll();
      setFolders(all);
    } catch (err) {
      console.error('Failed to load folders:', err);
    }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const all = await bookTagStorage.getAll();
      setTags(all);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  }, []);

  useEffect(() => {
    loadBooks();
    loadFolders();
    loadTags();
  }, [loadBooks, loadFolders, loadTags]);

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  // '/' focuses the search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
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

  useEffect(() => {
    if (creatingFolder && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [creatingFolder]);

  useEffect(() => {
    if (renamingFolderId && renameFolderInputRef.current) {
      renameFolderInputRef.current.focus();
      renameFolderInputRef.current.select();
    }
  }, [renamingFolderId]);

  useEffect(() => {
    if (creatingTag && newTagInputRef.current) {
      newTagInputRef.current.focus();
    }
  }, [creatingTag]);

  useEffect(() => {
    if (renamingTagId && renameTagInputRef.current) {
      renameTagInputRef.current.focus();
      renameTagInputRef.current.select();
    }
  }, [renamingTagId]);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const uploadFolderId = selection.kind === 'folder' ? selection.id : null;
      const uploadedIds: string[] = [];
      for (const file of Array.from(files)) {
        const created = await attachmentStorage.add('', file, uploadFolderId);
        uploadedIds.push(created.id);
      }
      if (selection.kind === 'tag') {
        await Promise.all(uploadedIds.map(id => attachmentStorage.setTags(id, [selection.id])));
      }
      await loadBooks();
      e.target.value = '';
    },
    [loadBooks, selection],
  );

  const handleOpen = useCallback(
    (book: AttachmentMeta, openInNewTab = false) => {
      attachmentStorage.markOpened(book.id).catch(() => {});
      const isViewable = book.type === 'application/pdf'
        || book.type === 'image/vnd.djvu'
        || book.type === 'image/x-djvu'
        || book.filename.toLowerCase().endsWith('.djvu');
      if (isViewable) {
        if (openInNewTab) {
          window.open(`/pdf/${book.id}`, '_blank', 'noopener,noreferrer');
        } else {
          navigate(`/pdf/${book.id}`);
        }
      } else {
        attachmentStorage.openFile(book.id);
      }
    },
    [navigate],
  );

  const handleDelete = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const msg = ids.length === 1
        ? 'Delete 1 book? This cannot be undone.'
        : `Delete ${ids.length} books? This cannot be undone.`;
      if (!confirm(msg)) return;
      await Promise.all(ids.map(id => attachmentStorage.delete(id)));
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setActiveId(prev => (prev && ids.includes(prev) ? null : prev));
      setAnchorId(prev => (prev && ids.includes(prev) ? null : prev));
      await loadBooks();
    },
    [loadBooks],
  );

  const startRename = useCallback((book: AttachmentMeta) => {
    setRenamingId(book.id);
    setRenameValue(book.filename);
  }, []);

  const commitRename = useCallback(async () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== books.find(b => b.id === renamingId)?.filename) {
      await attachmentStorage.rename(renamingId, trimmed);
      await loadBooks();
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, books, loadBooks]);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue('');
  }, []);

  const handleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir(field === 'name' ? 'asc' : 'desc');
      return field;
    });
  }, []);

  // Folder handlers
  const handleCreateFolder = useCallback(async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      setCreatingFolder(false);
      setNewFolderName('');
      return;
    }
    await folderStorage.create(trimmed);
    await loadFolders();
    setCreatingFolder(false);
    setNewFolderName('');
  }, [newFolderName, loadFolders]);

  const startRenameFolder = useCallback((folder: Folder) => {
    setRenamingFolderId(folder.id);
    setRenameFolderValue(folder.name);
  }, []);

  const commitRenameFolder = useCallback(async () => {
    if (!renamingFolderId) return;
    const trimmed = renameFolderValue.trim();
    if (trimmed && trimmed !== folders.find(f => f.id === renamingFolderId)?.name) {
      await folderStorage.rename(renamingFolderId, trimmed);
      await loadFolders();
    }
    setRenamingFolderId(null);
    setRenameFolderValue('');
  }, [renamingFolderId, renameFolderValue, folders, loadFolders]);

  const cancelRenameFolder = useCallback(() => {
    setRenamingFolderId(null);
    setRenameFolderValue('');
  }, []);

  const handleDeleteFolder = useCallback(async (folderId: string) => {
    await folderStorage.delete(folderId);
    setSelection(prev => (prev.kind === 'folder' && prev.id === folderId ? { kind: 'all' } : prev));
    await loadFolders();
    await loadBooks();
  }, [loadFolders, loadBooks]);

  const handleMoveToFolder = useCallback(async (bookIds: string[], folderId: string | null) => {
    await Promise.all(bookIds.map(id => attachmentStorage.moveToFolder(id, folderId)));
    await loadBooks();
    setMoveMenu(null);
  }, [loadBooks]);

  // Tag handlers
  const handleCreateTag = useCallback(async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) {
      setCreatingTag(false);
      setNewTagName('');
      return;
    }
    await bookTagStorage.create(trimmed, randomTagColor());
    await loadTags();
    setCreatingTag(false);
    setNewTagName('');
  }, [newTagName, loadTags]);

  const startRenameTag = useCallback((tag: BookTag) => {
    setRenamingTagId(tag.id);
    setRenameTagValue(tag.name);
  }, []);

  const commitRenameTag = useCallback(async () => {
    if (!renamingTagId) return;
    const trimmed = renameTagValue.trim();
    if (trimmed && trimmed !== tags.find(t => t.id === renamingTagId)?.name) {
      await bookTagStorage.rename(renamingTagId, trimmed);
      await loadTags();
    }
    setRenamingTagId(null);
    setRenameTagValue('');
  }, [renamingTagId, renameTagValue, tags, loadTags]);

  const cancelRenameTag = useCallback(() => {
    setRenamingTagId(null);
    setRenameTagValue('');
  }, []);

  const handleDeleteTag = useCallback(async (tagId: string) => {
    await bookTagStorage.delete(tagId);
    setSelection(prev => (prev.kind === 'tag' && prev.id === tagId ? { kind: 'all' } : prev));
    await loadTags();
    await loadBooks();
  }, [loadTags, loadBooks]);

  // Apply a tag to a set of books: if every book already has the tag, remove
  // it; otherwise add it to those missing it.
  const handleToggleBookTag = useCallback(async (bookIds: string[], tagId: string) => {
    const allHave = bookIds.every(bid => books.find(b => b.id === bid)?.tags?.includes(tagId));
    await Promise.all(bookIds.map(async bid => {
      const book = books.find(b => b.id === bid);
      const current = book?.tags ?? [];
      const next = allHave
        ? current.filter(t => t !== tagId)
        : current.includes(tagId) ? current : [...current, tagId];
      await attachmentStorage.setTags(bid, next);
    }));
    await loadBooks();
  }, [books, loadBooks]);

  const handleShuffleTagColors = useCallback(async () => {
    if (tags.length === 0) return;
    await Promise.all(tags.map(t => bookTagStorage.update(t.id, { color: randomTagColor() })));
    await loadTags();
  }, [tags, loadTags]);

  const handleRemoveBookTag = useCallback(async (bookId: string, tagId: string) => {
    const book = books.find(b => b.id === bookId);
    if (!book) return;
    const next = (book.tags ?? []).filter(t => t !== tagId);
    await attachmentStorage.setTags(bookId, next);
    await loadBooks();
  }, [books, loadBooks]);

  // Context menu for books
  const openBookContextMenu = useCallback((e: React.MouseEvent, book: AttachmentMeta) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, book });
    setFolderContextMenu(null);
    setTagContextMenu(null);
    setMoveMenu(null);
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const closeFolderContextMenu = useCallback(() => setFolderContextMenu(null), []);
  const closeTagContextMenu = useCallback(() => setTagContextMenu(null), []);
  const closeMoveMenu = useCallback(() => setMoveMenu(null), []);

  // Filtered and sorted books.
  // Folders exclude books from "All"; tags do NOT — a tag is an overlay filter
  // that shows matching books regardless of folder, and tagged books remain
  // visible in All as long as they're not inside a folder.
  const filteredBooks = useMemo(() => {
    let result = books;
    if (selection.kind === 'folder') {
      result = result.filter(b => b.folderId === selection.id);
    } else if (selection.kind === 'tag') {
      result = result.filter(b => b.tags?.includes(selection.id));
    } else {
      result = result.filter(b => !b.folderId);
    }
    if (searchQuery) {
      result = result.filter(b =>
        b.filename.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }
    return result;
  }, [books, selection, searchQuery]);

  const sortedBooks = useMemo(() => {
    const sorted = [...filteredBooks].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.filename.localeCompare(b.filename);
          break;
        case 'uploaded':
          cmp = a.createdAt.localeCompare(b.createdAt);
          break;
        case 'lastOpened':
          cmp = (a.lastOpenedAt ?? '').localeCompare(b.lastOpenedAt ?? '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredBooks, sortField, sortDir]);

  // Clear selection state when the visible set changes meaningfully.
  useEffect(() => {
    setSelectedIds(new Set());
    setActiveId(null);
    setAnchorId(null);
  }, [selection, searchQuery]);

  const tagsById = useMemo(() => {
    const map = new Map<string, BookTag>();
    for (const t of tags) map.set(t.id, t);
    return map;
  }, [tags]);

  // Selection helpers
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
    const el = cardRefs.current.get(id);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, []);

  const handleCardClick = useCallback((book: AttachmentMeta, e: React.MouseEvent) => {
    // Ignore clicks bubbled from interactive children
    const target = e.target as HTMLElement;
    if (target.closest('input, button, select, textarea')) return;

    if (e.shiftKey && anchorId !== null) {
      setSelectedIds(rangeBetween(anchorId, book.id));
      setActiveId(book.id);
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(book.id)) next.delete(book.id);
        else next.add(book.id);
        return next;
      });
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

  // Keyboard navigation: arrow keys to move, shift to extend, enter to open,
  // delete/backspace to delete, escape to clear.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      if (sortedBooks.length === 0) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        let newActiveId: string;
        if (activeId === null) {
          newActiveId = sortedBooks[0].id;
        } else {
          const currentIdx = sortedBooks.findIndex(b => b.id === activeId);
          if (currentIdx === -1) {
            newActiveId = sortedBooks[0].id;
          } else {
            const delta = e.key === 'ArrowDown' ? 1 : -1;
            const nextIdx = Math.max(0, Math.min(sortedBooks.length - 1, currentIdx + delta));
            newActiveId = sortedBooks[nextIdx].id;
          }
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
          const id = Array.from(selectedIds)[0];
          const book = books.find(b => b.id === id);
          if (book) {
            e.preventDefault();
            handleOpen(book);
          }
        }
      } else if (e.key === 'Escape') {
        if (selectedIds.size > 0) {
          setSelectedIds(new Set());
          setActiveId(null);
          setAnchorId(null);
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.size === 0) return;
        e.preventDefault();
        handleDelete(Array.from(selectedIds));
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sortedBooks, activeId, anchorId, selectedIds, books, handleOpen, handleDelete, rangeBetween, scrollIntoView]);

  // Sidebar tag click: apply to selection if any, otherwise filter.
  const handleSidebarTagClick = useCallback(async (tag: BookTag) => {
    if (selectedIds.size > 0) {
      await handleToggleBookTag(Array.from(selectedIds), tag.id);
      return;
    }
    setSelection(prev =>
      prev.kind === 'tag' && prev.id === tag.id ? { kind: 'all' } : { kind: 'tag', id: tag.id },
    );
  }, [selectedIds, handleToggleBookTag]);

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
              style={tag.color ? { backgroundColor: tag.color, color: '#fff' } : undefined}
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

  // Right-click context menu acts on the selection when the right-clicked
  // book is part of the selection; otherwise it acts on just that book.
  const bookContextMenuItems = useMemo((): ContextMenuItem[] => {
    if (!contextMenu) return [];
    const targetIds = selectedIds.has(contextMenu.book.id)
      ? Array.from(selectedIds)
      : [contextMenu.book.id];
    const items: ContextMenuItem[] = [];
    if (targetIds.length === 1) {
      items.push({ label: 'Rename', onClick: () => startRename(contextMenu.book) });
    }
    if (folders.length > 0) {
      items.push({
        label: 'Move to folder...',
        onClick: () => {
          setMoveMenu({ x: contextMenu.x, y: contextMenu.y, bookIds: targetIds });
        },
      });
    }
    if (targetIds.length === 1 && contextMenu.book.folderId) {
      items.push({
        label: 'Remove from folder',
        onClick: () => handleMoveToFolder([contextMenu.book.id], null),
      });
    }
    items.push({
      label: targetIds.length === 1 ? 'Delete' : `Delete ${targetIds.length}`,
      onClick: () => handleDelete(targetIds),
      danger: true,
    });
    return items;
  }, [contextMenu, selectedIds, folders, startRename, handleMoveToFolder, handleDelete]);

  // Move menu items
  const moveMenuItems = useMemo((): ContextMenuItem[] => {
    if (!moveMenu) return [];
    const items: ContextMenuItem[] = folders.map(f => ({
      label: f.name,
      onClick: () => handleMoveToFolder(moveMenu.bookIds, f.id),
    }));
    items.push({ label: 'No folder', onClick: () => handleMoveToFolder(moveMenu.bookIds, null) });
    return items;
  }, [moveMenu, folders, handleMoveToFolder]);

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
          <button className={styles.uploadButton} onClick={loadBooks}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return <span className={styles.sortArrow}>{sortDir === 'asc' ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}</span>;
  };

  const sidebarTagTooltip = (tag: BookTag) =>
    selectedIds.size > 0
      ? `Apply "${tag.name}" to ${selectedIds.size} selected book(s)`
      : `Filter by ${tag.name}`;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Library</h1>
        <div className={styles.headerActions}>
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewToggleBtn} ${viewMode === 'card' ? styles.viewToggleActive : ''}`}
              onClick={() => setViewMode('card')}
              title="Card view"
              aria-label="Card view"
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
          <button
            className={styles.uploadButton}
            onClick={() => fileInputRef.current?.click()}
          >
            + Upload Book
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className={styles.hiddenInput}
            onChange={handleUpload}
          />
        </div>
      </div>

      <div className={styles.layout}>
        {/* Sidebar: All, folders, then tags */}
        <nav className={styles.sidebar}>
          <button
            className={`${styles.sidebarItem} ${selection.kind === 'all' ? styles.sidebarItemActive : ''}`}
            onClick={() => setSelection({ kind: 'all' })}
          >
            Default
          </button>
          {folders.map(folder => (
            <div key={folder.id}>
              {renamingFolderId === folder.id ? (
                <input
                  ref={renameFolderInputRef}
                  className={styles.sidebarRenameInput}
                  value={renameFolderValue}
                  onChange={e => setRenameFolderValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRenameFolder();
                    if (e.key === 'Escape') cancelRenameFolder();
                  }}
                  onBlur={commitRenameFolder}
                />
              ) : (
                <button
                  className={`${styles.sidebarItem} ${selection.kind === 'folder' && selection.id === folder.id ? styles.sidebarItemActive : ''}`}
                  onClick={() => setSelection({ kind: 'folder', id: folder.id })}
                  onContextMenu={e => {
                    e.preventDefault();
                    setFolderContextMenu({ x: e.clientX, y: e.clientY, folder });
                    setContextMenu(null);
                    setTagContextMenu(null);
                    setMoveMenu(null);
                  }}
                >
                  {folder.name}
                </button>
              )}
            </div>
          ))}
          {creatingFolder ? (
            <input
              ref={newFolderInputRef}
              className={styles.sidebarRenameInput}
              value={newFolderName}
              placeholder="Folder name"
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') {
                  setCreatingFolder(false);
                  setNewFolderName('');
                }
              }}
              onBlur={handleCreateFolder}
            />
          ) : (
            <button
              className={styles.newFolderBtn}
              onClick={() => setCreatingFolder(true)}
            >
              + New Folder
            </button>
          )}

          <div className={styles.sidebarSectionHeader}>
            <span className={styles.sidebarSectionLabel}>Tags</span>
            {tags.length > 0 && (
              <button
                type="button"
                className={styles.sidebarHelpBtn}
                onClick={handleShuffleTagColors}
                title="Shuffle all tag colors"
                aria-label="Shuffle all tag colors"
              >
                ⤭
              </button>
            )}
          </div>
          {tags.map(tag => (
            <div key={tag.id}>
              {renamingTagId === tag.id ? (
                <input
                  ref={renameTagInputRef}
                  className={styles.sidebarRenameInput}
                  value={renameTagValue}
                  onChange={e => setRenameTagValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRenameTag();
                    if (e.key === 'Escape') cancelRenameTag();
                  }}
                  onBlur={commitRenameTag}
                />
              ) : (
                <button
                  className={`${styles.sidebarItem} ${selection.kind === 'tag' && selection.id === tag.id ? styles.sidebarItemActive : ''}`}
                  onClick={() => handleSidebarTagClick(tag)}
                  onContextMenu={e => {
                    e.preventDefault();
                    setTagContextMenu({ x: e.clientX, y: e.clientY, tag });
                    setContextMenu(null);
                    setFolderContextMenu(null);
                    setMoveMenu(null);
                  }}
                  title={sidebarTagTooltip(tag)}
                >
                  <span
                    className={styles.sidebarTagDot}
                    style={tag.color ? { backgroundColor: tag.color } : undefined}
                    aria-hidden="true"
                  />
                  {tag.name}
                </button>
              )}
            </div>
          ))}
          {creatingTag ? (
            <input
              ref={newTagInputRef}
              className={styles.sidebarRenameInput}
              value={newTagName}
              placeholder="Tag name"
              onChange={e => setNewTagName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateTag();
                if (e.key === 'Escape') {
                  setCreatingTag(false);
                  setNewTagName('');
                }
              }}
              onBlur={handleCreateTag}
            />
          ) : (
            <button
              className={styles.newFolderBtn}
              onClick={() => setCreatingTag(true)}
            >
              + New Tag
            </button>
          )}
        </nav>

        {/* Main content */}
        <div className={styles.content}>
          {books.length > 0 && (
            <div className={styles.searchRow}>
              <SearchBar ref={searchInputRef} value={searchQuery} onChange={setSearchQuery} />
              {selectedIds.size > 0 && (
                <span className={styles.selectionCount}>
                  {selectedIds.size} selected
                </span>
              )}
            </div>
          )}

          <div className={styles.listArea}>
          {sortedBooks.length === 0 ? (
            <div className={styles.empty}>
              {books.length === 0 ? (
                <>
                  <p className={styles.emptyTitle}>No books yet</p>
                  <p className={styles.emptyText}>
                    Upload your first book to get started.
                  </p>
                </>
              ) : filteredBooks.length === 0 && selection.kind === 'folder' && !searchQuery ? (
                <>
                  <p className={styles.emptyTitle}>This folder is empty</p>
                  <p className={styles.emptyText}>
                    Right-click a book and choose &quot;Move to folder&quot; to add books here.
                  </p>
                </>
              ) : filteredBooks.length === 0 && selection.kind === 'tag' && !searchQuery ? (
                <>
                  <p className={styles.emptyTitle}>No books with this tag</p>
                  <p className={styles.emptyText}>
                    Select books and click the tag in the sidebar to apply it.
                  </p>
                </>
              ) : (
                <>
                  <p className={styles.emptyTitle}>No matching books</p>
                  <p className={styles.emptyText}>
                    Try adjusting your search.
                  </p>
                </>
              )}
            </div>
          ) : viewMode === 'card' ? (
            <div className={styles.cardList}>
              {sortedBooks.map(book => {
                const isSelected = selectedIds.has(book.id);
                const isActive = activeId === book.id;
                return (
                  <article
                    key={book.id}
                    ref={el => {
                      if (el) cardRefs.current.set(book.id, el);
                      else cardRefs.current.delete(book.id);
                    }}
                    className={`${styles.card} ${isSelected ? styles.cardSelected : ''} ${isActive ? styles.cardActive : ''}`}
                    onClick={e => handleCardClick(book, e)}
                    onDoubleClick={e => handleCardDoubleClick(book, e)}
                    onAuxClick={e => {
                      if (e.button === 1) handleOpen(book, true);
                    }}
                    onContextMenu={e => openBookContextMenu(e, book)}
                  >
                    <div className={styles.cardTitle}>
                      {renamingId === book.id ? (
                        <input
                          ref={renameInputRef}
                          className={styles.renameInput}
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') cancelRename();
                          }}
                          onBlur={commitRename}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        stripExtension(book.filename)
                      )}
                    </div>
                    <div className={styles.cardMeta}>
                      {book.subject && (
                        <span className={styles.cardSubject}>{book.subject}</span>
                      )}
                      {renderTagChips(book)}
                      <span className={styles.cardDates}>
                        <span title="Last opened">
                          {book.lastOpenedAt ? formatDate(book.lastOpenedAt) : '—'}
                        </span>
                        <span className={styles.cardDatesSep} aria-hidden="true" />
                        <span title="Added">
                          {formatDate(book.createdAt)}
                        </span>
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.listContainer}>
              <table className={styles.listTable}>
                <thead>
                  <tr className={styles.listHeaderRow}>
                    <th className={styles.listHeaderCell} onClick={() => handleSort('name')}>
                      Name{sortIndicator('name')}
                    </th>
                    <th className={styles.listHeaderCell}>Type</th>
                    <th className={styles.listHeaderCell}>Tags</th>
                    <th className={styles.listHeaderCell} onClick={() => handleSort('uploaded')}>
                      Uploaded{sortIndicator('uploaded')}
                    </th>
                    <th className={styles.listHeaderCell} onClick={() => handleSort('lastOpened')}>
                      Last Opened{sortIndicator('lastOpened')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBooks.map(book => {
                    const isSelected = selectedIds.has(book.id);
                    const isActive = activeId === book.id;
                    return (
                      <tr
                        key={book.id}
                        ref={el => {
                          if (el) cardRefs.current.set(book.id, el);
                          else cardRefs.current.delete(book.id);
                        }}
                        className={`${styles.listRow} ${isSelected ? styles.listRowSelected : ''} ${isActive ? styles.listRowActive : ''}`}
                        onClick={e => handleCardClick(book, e)}
                        onDoubleClick={e => handleCardDoubleClick(book, e)}
                        onAuxClick={e => {
                          if (e.button === 1) handleOpen(book, true);
                        }}
                        onContextMenu={e => openBookContextMenu(e, book)}
                      >
                        <td className={styles.listNameCell}>
                          {renamingId === book.id ? (
                            <input
                              ref={renameInputRef}
                              className={styles.renameInput}
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitRename();
                                if (e.key === 'Escape') cancelRename();
                              }}
                              onBlur={commitRename}
                              onClick={e => e.stopPropagation()}
                            />
                          ) : (
                            <span className={styles.listFileName}>{stripExtension(book.filename)}</span>
                          )}
                        </td>
                        <td className={styles.listCell}>{getFileExtension(book.filename)}</td>
                        <td className={styles.listCell}>{renderTagChips(book)}</td>
                        <td className={styles.listCell}>{formatDate(book.createdAt)}</td>
                        <td className={styles.listCell}>
                          {book.lastOpenedAt ? formatDate(book.lastOpenedAt) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Context menus */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={bookContextMenuItems}
          onClose={closeContextMenu}
        />
      )}
      {folderContextMenu && (
        <ContextMenu
          x={folderContextMenu.x}
          y={folderContextMenu.y}
          items={[
            { label: 'Rename', onClick: () => startRenameFolder(folderContextMenu.folder) },
            { label: 'Delete folder', onClick: () => handleDeleteFolder(folderContextMenu.folder.id), danger: true },
          ]}
          onClose={closeFolderContextMenu}
        />
      )}
      {tagContextMenu && (
        <ContextMenu
          x={tagContextMenu.x}
          y={tagContextMenu.y}
          items={[
            { label: 'Rename', onClick: () => startRenameTag(tagContextMenu.tag) },
            { label: 'Delete tag', onClick: () => handleDeleteTag(tagContextMenu.tag.id), danger: true },
          ]}
          onClose={closeTagContextMenu}
        />
      )}
      {moveMenu && (
        <ContextMenu
          x={moveMenu.x}
          y={moveMenu.y}
          items={moveMenuItems}
          onClose={closeMoveMenu}
        />
      )}
    </div>
  );
}

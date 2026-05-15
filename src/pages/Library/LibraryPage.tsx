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
type SortField = 'name' | 'uploaded' | 'lastOpened' | 'size';
type SortDir = 'asc' | 'desc';

type Selection =
  | { kind: 'all' }
  | { kind: 'folder'; id: string }
  | { kind: 'tag'; id: string };

const VIEW_MODE_KEY = 'scribe_library_view';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return saved === 'list' ? 'list' : 'card';
  });
  const [sortField, setSortField] = useState<SortField>('lastOpened');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
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
  const [tagMenu, setTagMenu] = useState<{ x: number; y: number; bookIds: string[] } | null>(null);

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
      // If uploading while a tag is selected, tag the new uploads with that tag
      // so they appear in the current view.
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
    async (id: string) => {
      await attachmentStorage.delete(id);
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await loadBooks();
    },
    [loadBooks],
  );

  const handleDeleteSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map(id => attachmentStorage.delete(id)));
    setSelectedIds(new Set());
    await loadBooks();
  }, [selectedIds, loadBooks]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleSelectMode = useCallback(() => {
    setSelectMode(prev => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

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
    await bookTagStorage.create(trimmed);
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

  const handleToggleBookTag = useCallback(async (bookIds: string[], tagId: string) => {
    // Determine whether to add or remove based on majority: if every selected
    // book already has this tag, remove it; otherwise add it to those missing it.
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

  // Context menu for books
  const openBookContextMenu = useCallback((e: React.MouseEvent, book: AttachmentMeta) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, book });
    setFolderContextMenu(null);
    setTagContextMenu(null);
    setMoveMenu(null);
    setTagMenu(null);
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const closeFolderContextMenu = useCallback(() => setFolderContextMenu(null), []);
  const closeTagContextMenu = useCallback(() => setTagContextMenu(null), []);
  const closeMoveMenu = useCallback(() => setMoveMenu(null), []);
  const closeTagMenu = useCallback(() => setTagMenu(null), []);

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
        case 'size':
          cmp = a.size - b.size;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredBooks, sortField, sortDir]);

  const allFilteredIds = sortedBooks.map(b => b.id);
  const allSelected = sortedBooks.length > 0 && selectedIds.size === sortedBooks.length && sortedBooks.every(b => selectedIds.has(b.id));

  const tagsById = useMemo(() => {
    const map = new Map<string, BookTag>();
    for (const t of tags) map.set(t.id, t);
    return map;
  }, [tags]);

  const renderTagChips = (book: AttachmentMeta) => {
    if (!book.tags || book.tags.length === 0) return null;
    return (
      <div className={styles.tagChipRow}>
        {book.tags.map(tid => {
          const tag = tagsById.get(tid);
          if (!tag) return null;
          return (
            <span key={tid} className={styles.tagChip}>
              {tag.name}
            </span>
          );
        })}
      </div>
    );
  };

  // Build context menu items for a book
  const bookContextMenuItems = useMemo((): ContextMenuItem[] => {
    if (!contextMenu) return [];
    const items: ContextMenuItem[] = [
      { label: 'Rename', onClick: () => startRename(contextMenu.book) },
    ];
    if (folders.length > 0) {
      items.push({
        label: 'Move to folder...',
        onClick: () => {
          setMoveMenu({ x: contextMenu.x, y: contextMenu.y, bookIds: [contextMenu.book.id] });
        },
      });
    }
    if (contextMenu.book.folderId) {
      items.push({
        label: 'Remove from folder',
        onClick: () => handleMoveToFolder([contextMenu.book.id], null),
      });
    }
    items.push({
      label: 'Edit tags...',
      onClick: () => {
        setTagMenu({ x: contextMenu.x, y: contextMenu.y, bookIds: [contextMenu.book.id] });
      },
    });
    items.push({ label: 'Delete', onClick: () => handleDelete(contextMenu.book.id), danger: true });
    return items;
  }, [contextMenu, folders, startRename, handleMoveToFolder, handleDelete]);

  // Build move menu items
  const moveMenuItems = useMemo((): ContextMenuItem[] => {
    if (!moveMenu) return [];
    const items: ContextMenuItem[] = folders.map(f => ({
      label: f.name,
      onClick: () => handleMoveToFolder(moveMenu.bookIds, f.id),
    }));
    items.push({ label: 'No folder', onClick: () => handleMoveToFolder(moveMenu.bookIds, null) });
    return items;
  }, [moveMenu, folders, handleMoveToFolder]);

  // Build tag picker items: each tag toggles on click, menu stays open.
  // For multi-book selection: the checked indicator is set when EVERY selected
  // book has that tag (so click removes); otherwise click adds.
  const tagMenuItems = useMemo((): ContextMenuItem[] => {
    if (!tagMenu) return [];
    if (tags.length === 0) {
      return [
        {
          label: 'No tags yet — create one in the sidebar',
          onClick: () => {},
        },
      ];
    }
    return tags.map(tag => {
      const allHave = tagMenu.bookIds.every(bid => books.find(b => b.id === bid)?.tags?.includes(tag.id));
      return {
        label: tag.name,
        onClick: () => handleToggleBookTag(tagMenu.bookIds, tag.id),
        checked: allHave,
        keepOpen: true,
      };
    });
  }, [tagMenu, tags, books, handleToggleBookTag]);

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
            All
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
                    setTagMenu(null);
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

          <div className={styles.sidebarSectionLabel}>Tags</div>
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
                  onClick={() => setSelection({ kind: 'tag', id: tag.id })}
                  onContextMenu={e => {
                    e.preventDefault();
                    setTagContextMenu({ x: e.clientX, y: e.clientY, tag });
                    setContextMenu(null);
                    setFolderContextMenu(null);
                    setMoveMenu(null);
                    setTagMenu(null);
                  }}
                >
                  <span className={styles.sidebarTagDot} aria-hidden="true" />
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
              <SearchBar value={searchQuery} onChange={setSearchQuery} />
            </div>
          )}

          {books.length > 0 && (
            <div className={styles.toolbarRow}>
              <button
                className={`${styles.selectToggleBtn} ${selectMode ? styles.selectToggleActive : ''}`}
                onClick={toggleSelectMode}
              >
                {selectMode ? 'Cancel' : 'Select'}
              </button>
              {selectMode && selectedIds.size > 0 && (
                <>
                  <span className={styles.bulkCount}>{selectedIds.size} selected</span>
                  {folders.length > 0 && (
                    <button
                      className={styles.bulkMoveBtn}
                      onClick={e => setMoveMenu({ x: e.clientX, y: e.clientY, bookIds: Array.from(selectedIds) })}
                    >
                      Move to folder
                    </button>
                  )}
                  <button
                    className={styles.bulkMoveBtn}
                    onClick={e => setTagMenu({ x: e.clientX, y: e.clientY, bookIds: Array.from(selectedIds) })}
                  >
                    Edit tags
                  </button>
                  <button className={styles.bulkDeleteBtn} onClick={handleDeleteSelected}>
                    Delete selected
                  </button>
                  <button className={styles.bulkDeselectBtn} onClick={handleDeselectAll}>
                    Deselect all
                  </button>
                </>
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
                    Right-click a book and choose &quot;Edit tags...&quot; to assign this tag.
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
            <div className={styles.grid}>
              {sortedBooks.map(book => (
                <article
                  key={book.id}
                  className={`${styles.card} ${selectMode && selectedIds.has(book.id) ? styles.cardSelected : ''}`}
                  onClick={e => {
                    if (selectMode) {
                      handleToggleSelect(book.id);
                    } else {
                      handleOpen(book, e.ctrlKey || e.metaKey);
                    }
                  }}
                  onAuxClick={e => {
                    if (e.button === 1 && !selectMode) handleOpen(book, true);
                  }}
                  onContextMenu={e => openBookContextMenu(e, book)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !selectMode) handleOpen(book);
                  }}
                >
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(book.id)}
                      onChange={() => handleToggleSelect(book.id)}
                      className={styles.cardCheckbox}
                      onClick={e => e.stopPropagation()}
                    />
                  )}
                  <div className={styles.cardTitle}>{stripExtension(book.filename)}</div>
                  <div className={styles.cardMeta}>
                    <span className={styles.cardSize}>
                      {formatFileSize(book.size)}
                    </span>
                    <span className={styles.cardDate}>
                      {formatDate(book.createdAt)}
                    </span>
                  </div>
                  {book.subject && (
                    <div className={styles.cardSubject}>{book.subject}</div>
                  )}
                  {renderTagChips(book)}
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.listContainer}>
              <table className={styles.listTable}>
                <thead>
                  <tr className={styles.listHeaderRow}>
                    {selectMode && (
                      <th className={styles.listCheckboxCol}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => allSelected ? handleDeselectAll() : handleSelectAll(allFilteredIds)}
                          className={styles.checkbox}
                        />
                      </th>
                    )}
                    <th className={styles.listHeaderCell} onClick={() => handleSort('name')}>
                      Name{sortIndicator('name')}
                    </th>
                    <th className={styles.listHeaderCell}>Type</th>
                    <th className={styles.listHeaderCell}>Tags</th>
                    <th className={styles.listHeaderCell} onClick={() => handleSort('size')}>
                      Size{sortIndicator('size')}
                    </th>
                    <th className={styles.listHeaderCell} onClick={() => handleSort('uploaded')}>
                      Uploaded{sortIndicator('uploaded')}
                    </th>
                    <th className={styles.listHeaderCell} onClick={() => handleSort('lastOpened')}>
                      Last Opened{sortIndicator('lastOpened')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBooks.map(book => (
                    <tr
                      key={book.id}
                      className={`${styles.listRow} ${selectedIds.has(book.id) ? styles.listRowSelected : ''}`}
                      onContextMenu={e => openBookContextMenu(e, book)}
                    >
                      {selectMode && (
                        <td className={styles.listCheckboxCol}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(book.id)}
                            onChange={() => handleToggleSelect(book.id)}
                            className={styles.checkbox}
                          />
                        </td>
                      )}
                      <td
                        className={styles.listNameCell}
                        onClick={e => {
                          if (selectMode) {
                            handleToggleSelect(book.id);
                          } else if (renamingId !== book.id) {
                            handleOpen(book, e.ctrlKey || e.metaKey);
                          }
                        }}
                      >
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
                      <td className={styles.listCell}>{formatFileSize(book.size)}</td>
                      <td className={styles.listCell}>{formatDate(book.createdAt)}</td>
                      <td className={styles.listCell}>
                        {book.lastOpenedAt ? formatDate(book.lastOpenedAt) : '—'}
                      </td>
                    </tr>
                  ))}
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
      {tagMenu && (
        <ContextMenu
          x={tagMenu.x}
          y={tagMenu.y}
          items={tagMenuItems}
          onClose={closeTagMenu}
        />
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchBar } from '../../components/SearchBar/SearchBar';
import { ContextMenu } from '../../components/ContextMenu/ContextMenu';
import type { ContextMenuItem } from '../../components/ContextMenu/ContextMenu';
import { attachmentStorage } from '../../services/attachmentStorage';
import { folderStorage } from '../../services/folderStorage';
import type { AttachmentMeta } from '../../types/attachment';
import type { Folder } from '../../types/folder';
import { ChevronUpIcon, ChevronDownIcon } from '../../components/Icons/Icons';
import { stripExtension } from '../../utils/filename';
import styles from './LibraryPage.module.css';

type ViewMode = 'card' | 'list';
type SortField = 'name' | 'uploaded' | 'lastOpened' | 'size';
type SortDir = 'asc' | 'desc';

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

  // Folder state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const renameFolderInputRef = useRef<HTMLInputElement>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; book: AttachmentMeta } | null>(null);
  const [folderContextMenu, setFolderContextMenu] = useState<{ x: number; y: number; folder: Folder } | null>(null);
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

  useEffect(() => {
    loadBooks();
    loadFolders();
  }, [loadBooks, loadFolders]);

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

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      for (const file of Array.from(files)) {
        await attachmentStorage.add('', file, currentFolderId);
      }
      await loadBooks();
      e.target.value = '';
    },
    [loadBooks, currentFolderId],
  );

  const handleOpen = useCallback(
    (book: AttachmentMeta, openInNewTab = false) => {
      attachmentStorage.markOpened(book.id).catch(() => {});
      if (book.type === 'application/pdf') {
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
    if (currentFolderId === folderId) setCurrentFolderId(null);
    await loadFolders();
    await loadBooks();
  }, [currentFolderId, loadFolders, loadBooks]);

  const handleMoveToFolder = useCallback(async (bookIds: string[], folderId: string | null) => {
    await Promise.all(bookIds.map(id => attachmentStorage.moveToFolder(id, folderId)));
    await loadBooks();
    setMoveMenu(null);
  }, [loadBooks]);

  // Context menu for books
  const openBookContextMenu = useCallback((e: React.MouseEvent, book: AttachmentMeta) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, book });
    setFolderContextMenu(null);
    setMoveMenu(null);
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const closeFolderContextMenu = useCallback(() => setFolderContextMenu(null), []);
  const closeMoveMenu = useCallback(() => setMoveMenu(null), []);

  // Filtered and sorted books
  const filteredBooks = useMemo(() => {
    let result = books;
    if (currentFolderId) {
      result = result.filter(b => b.folderId === currentFolderId);
    } else {
      result = result.filter(b => !b.folderId);
    }
    if (searchQuery) {
      result = result.filter(b =>
        b.filename.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }
    return result;
  }, [books, currentFolderId, searchQuery]);

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
        {/* Folder sidebar */}
        <nav className={styles.sidebar}>
          <button
            className={`${styles.sidebarItem} ${currentFolderId === null ? styles.sidebarItemActive : ''}`}
            onClick={() => setCurrentFolderId(null)}
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
                  className={`${styles.sidebarItem} ${currentFolderId === folder.id ? styles.sidebarItemActive : ''}`}
                  onClick={() => setCurrentFolderId(folder.id)}
                  onContextMenu={e => {
                    e.preventDefault();
                    setFolderContextMenu({ x: e.clientX, y: e.clientY, folder });
                    setContextMenu(null);
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
              ) : filteredBooks.length === 0 && currentFolderId && !searchQuery ? (
                <>
                  <p className={styles.emptyTitle}>This folder is empty</p>
                  <p className={styles.emptyText}>
                    Right-click a book and choose &quot;Move to folder&quot; to add books here.
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

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchBar } from '../../components/SearchBar/SearchBar';
import { attachmentStorage } from '../../services/attachmentStorage';
import type { AttachmentMeta } from '../../types/attachment';
import { ChevronUpIcon, ChevronDownIcon } from '../../components/Icons/Icons';
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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await attachmentStorage.add('', file);
      await loadBooks();
      e.target.value = '';
    },
    [loadBooks],
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
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
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

  const filteredBooks = searchQuery
    ? books.filter(b =>
        b.filename.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : books;

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
            className={styles.hiddenInput}
            onChange={handleUpload}
          />
        </div>
      </div>

      {books.length > 0 && (
        <div className={styles.searchRow}>
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>
      )}

      {selectedIds.size > 0 && viewMode === 'list' && (
        <div className={styles.bulkToolbar}>
          <span className={styles.bulkCount}>{selectedIds.size} selected</span>
          <button className={styles.bulkDeleteBtn} onClick={handleDeleteSelected}>
            Delete selected
          </button>
          <button className={styles.bulkDeselectBtn} onClick={handleDeselectAll}>
            Deselect all
          </button>
        </div>
      )}

      {sortedBooks.length === 0 ? (
        <div className={styles.empty}>
          {books.length === 0 ? (
            <>
              <p className={styles.emptyTitle}>No books yet</p>
              <p className={styles.emptyText}>
                Upload your first book to get started.
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
              className={styles.card}
              onClick={e => handleOpen(book, e.ctrlKey || e.metaKey)}
              onAuxClick={e => {
                if (e.button === 1) handleOpen(book, true);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter') handleOpen(book);
              }}
            >
              <div className={styles.cardTitle}>{book.filename}</div>
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
              <button
                className={styles.deleteBtn}
                onClick={e => handleDelete(e, book.id)}
                title="Remove from library"
              >
                Remove
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.listContainer}>
          <table className={styles.listTable}>
            <thead>
              <tr className={styles.listHeaderRow}>
                <th className={styles.listCheckboxCol}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => allSelected ? handleDeselectAll() : handleSelectAll(allFilteredIds)}
                    className={styles.checkbox}
                  />
                </th>
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
                <th className={styles.listHeaderCell}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedBooks.map(book => (
                <tr
                  key={book.id}
                  className={`${styles.listRow} ${selectedIds.has(book.id) ? styles.listRowSelected : ''}`}
                >
                  <td className={styles.listCheckboxCol}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(book.id)}
                      onChange={() => handleToggleSelect(book.id)}
                      className={styles.checkbox}
                    />
                  </td>
                  <td
                    className={styles.listNameCell}
                    onClick={e => {
                      if (renamingId !== book.id) handleOpen(book, e.ctrlKey || e.metaKey);
                    }}
                    onDoubleClick={e => {
                      e.stopPropagation();
                      startRename(book);
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
                      <span className={styles.listFileName}>{book.filename}</span>
                    )}
                  </td>
                  <td className={styles.listCell}>{getFileExtension(book.filename)}</td>
                  <td className={styles.listCell}>{formatFileSize(book.size)}</td>
                  <td className={styles.listCell}>{formatDate(book.createdAt)}</td>
                  <td className={styles.listCell}>
                    {book.lastOpenedAt ? formatDate(book.lastOpenedAt) : '—'}
                  </td>
                  <td className={styles.listActionsCell}>
                    <button
                      className={styles.listActionBtn}
                      onClick={() => startRename(book)}
                      title="Rename"
                    >
                      Rename
                    </button>
                    <button
                      className={`${styles.listActionBtn} ${styles.listDeleteBtn}`}
                      onClick={e => handleDelete(e, book.id)}
                      title="Remove from library"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

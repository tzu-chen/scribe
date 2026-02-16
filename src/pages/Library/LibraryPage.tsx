import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchBar } from '../../components/SearchBar/SearchBar';
import { attachmentStorage } from '../../services/attachmentStorage';
import type { AttachmentMeta } from '../../types/attachment';
import styles from './LibraryPage.module.css';

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

export function LibraryPage() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<AttachmentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBooks = useCallback(async () => {
    const all = await attachmentStorage.getAll();
    setBooks(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

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
    (book: AttachmentMeta) => {
      if (book.type === 'application/pdf') {
        navigate(`/pdf/${book.id}`);
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
      await loadBooks();
    },
    [loadBooks],
  );

  const filteredBooks = searchQuery
    ? books.filter(b =>
        b.filename.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : books;

  if (loading) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>Loading library...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Library</h1>
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

      {books.length > 0 && (
        <div className={styles.searchRow}>
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>
      )}

      {filteredBooks.length === 0 ? (
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
      ) : (
        <div className={styles.grid}>
          {filteredBooks.map(book => (
            <article
              key={book.id}
              className={styles.card}
              onClick={() => handleOpen(book)}
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
      )}
    </div>
  );
}

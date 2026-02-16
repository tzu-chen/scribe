import { useState, useEffect } from 'react';
import { attachmentStorage } from '../../services/attachmentStorage';
import type { AttachmentMeta } from '../../types/attachment';
import styles from './BookPicker.module.css';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface BookPickerProps {
  onSelect: (book: AttachmentMeta) => void;
  onCancel: () => void;
}

export function BookPicker({ onSelect, onCancel }: BookPickerProps) {
  const [books, setBooks] = useState<AttachmentMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    attachmentStorage.getAll().then(all => {
      setBooks(all);
      setLoading(false);
    });
  }, []);

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Select a book from your library</h3>
          <button
            className={styles.close}
            onClick={onCancel}
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        {loading ? (
          <p className={styles.loading}>Loading...</p>
        ) : books.length === 0 ? (
          <p className={styles.empty}>
            No books in your library yet. Upload books from the Library page
            first.
          </p>
        ) : (
          <ul className={styles.list}>
            {books.map(book => (
              <li key={book.id} className={styles.item}>
                <button
                  className={styles.filename}
                  onClick={() => onSelect(book)}
                  title={`Select ${book.filename}`}
                >
                  {book.filename}
                </button>
                <span className={styles.size}>
                  {formatFileSize(book.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

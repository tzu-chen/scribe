import { useState } from 'react';
import { BookCover } from '../../components/BookCover/BookCover';
import { attachmentStorage } from '../../services/attachmentStorage';
import type { AttachmentKind, AttachmentMeta } from '../../types/attachment';
import { ATTACHMENT_KINDS, KIND_LABELS } from '../../types/attachment';
import type { Folder } from '../../types/folder';
import type { BookTag } from '../../types/bookTag';
import { displayTitle } from '../../utils/libraryActivity';
import styles from './UploadTriage.module.css';

interface Props {
  /** Just-uploaded items, newest first. */
  books: AttachmentMeta[];
  folders: Folder[];
  tags: BookTag[];
  onChanged: () => Promise<void> | void;
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}

/**
 * Inline classification strip shown right after an upload, while the user
 * still has context: kind (prefilled with the guess), project, tags. Every
 * control writes immediately; "Done" just hides the row.
 */
export function UploadTriage({ books, folders, tags, onChanged, onDismiss, onDismissAll }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const activeFolders = folders.filter(f => !f.archivedAt);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
      await onChanged();
    } finally {
      setBusy(null);
    }
  };

  if (books.length === 0) return null;

  return (
    <section className={styles.triage} aria-label="Just uploaded">
      <div className={styles.header}>
        <span className={styles.title}>
          Just uploaded
          <span className={styles.count}>{books.length}</span>
        </span>
        <span className={styles.hint}>Classify now while it's fresh — or skip; guesses are shown in grey.</span>
        <button type="button" className={styles.dismissAll} onClick={onDismissAll}>
          Done
        </button>
      </div>
      <ul className={styles.rows}>
        {books.map(book => {
          const disabled = busy === book.id;
          return (
            <li key={book.id} className={styles.row}>
              <BookCover book={book} size="sm" />
              <div className={styles.name}>
                <span className={styles.nameTitle} title={book.filename}>{displayTitle(book)}</span>
                <span className={styles.nameMeta}>
                  {book.pageCount ? `${book.pageCount} pp` : book.enrichedAt ? '' : 'reading file…'}
                  {book.authors ? ` · ${book.authors}` : ''}
                </span>
              </div>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Kind</span>
                <select
                  className={`${styles.select} ${book.kind && !book.kindManual ? styles.selectGuess : ''}`}
                  value={book.kind ?? ''}
                  disabled={disabled}
                  onChange={e => {
                    const v = e.target.value as AttachmentKind | '';
                    run(book.id, () => attachmentStorage.setKind(book.id, v === '' ? null : v));
                  }}
                >
                  <option value="">Unsorted</option>
                  {ATTACHMENT_KINDS.map(k => (
                    <option key={k} value={k}>{KIND_LABELS[k].singular}</option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>Project</span>
                <select
                  className={styles.select}
                  value={book.folderIds[0] ?? ''}
                  disabled={disabled || activeFolders.length === 0}
                  onChange={e => {
                    const v = e.target.value;
                    const rest = book.folderIds.filter(id => id !== v && !activeFolders.some(f => f.id === id));
                    run(book.id, () => attachmentStorage.setFolders(book.id, v ? [v, ...rest] : rest));
                  }}
                >
                  <option value="">{activeFolders.length === 0 ? 'No projects yet' : 'None'}</option>
                  {activeFolders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </label>

              {tags.length > 0 && (
                <div className={styles.tagList} role="group" aria-label="Tags">
                  {tags.map(t => {
                    const on = (book.tags ?? []).includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`${styles.tagToggle} ${on ? styles.tagToggleOn : ''}`}
                        style={on && t.color ? { backgroundColor: t.color, color: 'var(--color-on-solid)', borderColor: t.color } : undefined}
                        disabled={disabled}
                        onClick={() => {
                          const current = book.tags ?? [];
                          const next = on ? current.filter(id => id !== t.id) : [...current, t.id];
                          run(book.id, () => attachmentStorage.setTags(book.id, next));
                        }}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              )}

              <button type="button" className={styles.rowDismiss} onClick={() => onDismiss(book.id)} aria-label="Done with this item" title="Done">
                ✓
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

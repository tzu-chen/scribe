import { useMemo } from 'react';
import { format } from 'date-fns';
import type { Note } from '../../types/note';
import styles from './PdfRightPanel.module.css';

interface Props {
  notes: Note[];
  subject: string;
  onNavigateToNote: (noteId: string) => void;
}

export function PdfNotesTab({ notes, subject, onNavigateToNote }: Props) {
  const subjectNotes = useMemo(
    () =>
      notes
        .filter(n => n.subject === subject)
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    [notes, subject],
  );

  if (!subject) {
    return (
      <p className={styles.empty}>No subject associated with this file.</p>
    );
  }

  if (subjectNotes.length === 0) {
    return (
      <p className={styles.empty}>
        No notes found for subject &ldquo;{subject}&rdquo;.
      </p>
    );
  }

  return (
    <ul className={styles.noteList}>
      {subjectNotes.map(note => (
        <li key={note.id}>
          <button
            className={styles.noteItem}
            onClick={() => onNavigateToNote(note.id)}
          >
            <span className={styles.noteTitle}>
              {note.title || 'Untitled'}
            </span>
            <span
              className={`${styles.noteStatus} ${note.status === 'published' ? styles.published : styles.draft}`}
            >
              {note.status}
            </span>
            <time className={styles.noteDate}>
              {format(new Date(note.updatedAt), 'MMM d, yyyy')}
            </time>
          </button>
        </li>
      ))}
    </ul>
  );
}

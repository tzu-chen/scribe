import { useMemo } from 'react';
import { format } from 'date-fns';
import type { Note } from '../../types/note';
import styles from './PdfRightPanel.module.css';

interface Props {
  notes: Note[];
  subject: string;
  onNavigateToNote: (noteId: string) => void;
  onEditNote: (noteId: string) => void;
}

export function PdfNotesTab({ notes, subject, onNavigateToNote, onEditNote }: Props) {
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
        <li key={note.id} className={styles.noteItemRow}>
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
          <button
            className={styles.noteEditBtn}
            onClick={() => onEditNote(note.id)}
            title="Edit note side-by-side"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086zM11.189 6.25 9.75 4.81 3.34 11.22a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.249.249 0 0 0 .108-.064l6.41-6.41z"
                fill="currentColor"
              />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  );
}

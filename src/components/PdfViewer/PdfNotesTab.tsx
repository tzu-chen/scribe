import { useMemo, type ReactNode } from 'react';
import { format } from 'date-fns';
import type { Note } from '../../types/note';
import { PlusIcon } from '../Icons/Icons';
import styles from './PdfRightPanel.module.css';

interface Props {
  notes: Note[];
  subject: string;
  attachmentId?: string;
  onCreateNote: () => void;
  onNavigateToNote: (noteId: string) => void;
  onEditNote: (noteId: string) => void;
}

function NoteItem({ note, onNavigate, onEdit }: { note: Note; onNavigate: () => void; onEdit: () => void }) {
  return (
    <li className={styles.noteItemRow}>
      <button className={styles.noteItem} onClick={onNavigate}>
        <span className={styles.noteTitle}>
          {note.title || 'Untitled'}
        </span>
        <div className={styles.noteMetaRow}>
          {note.page != null && (
            <span className={styles.pageBadge}>p. {note.page}</span>
          )}
          <span
            className={`${styles.noteStatus} ${note.status === 'published' ? styles.published : styles.draft}`}
          >
            {note.status}
          </span>
        </div>
        <time className={styles.noteDate}>
          {format(new Date(note.updatedAt), 'MMM d, yyyy')}
        </time>
      </button>
      <button
        className={styles.noteEditBtn}
        onClick={onEdit}
        title="Edit note"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086zM11.189 6.25 9.75 4.81 3.34 11.22a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.249.249 0 0 0 .108-.064l6.41-6.41z"
            fill="currentColor"
          />
        </svg>
      </button>
    </li>
  );
}

export function PdfNotesTab({ notes, subject, attachmentId, onCreateNote, onNavigateToNote, onEditNote }: Props) {
  const sortByDate = (a: Note, b: Note) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

  // Notes linked to this specific attachment, grouped by page
  const { pageGroups, generalNotes } = useMemo(() => {
    if (!attachmentId) return { pageGroups: new Map<number, Note[]>(), generalNotes: [] as Note[] };
    const attachmentNotes = notes.filter(n => n.attachmentId === attachmentId).sort(sortByDate);
    const groups = new Map<number, Note[]>();
    const general: Note[] = [];
    for (const note of attachmentNotes) {
      if (note.page != null) {
        const list = groups.get(note.page) || [];
        list.push(note);
        groups.set(note.page, list);
      } else {
        general.push(note);
      }
    }
    return { pageGroups: groups, generalNotes: general };
  }, [notes, attachmentId]);

  // Subject-linked notes that aren't already shown as attachment notes
  const subjectNotes = useMemo(() => {
    if (!subject) return [];
    const attachmentNoteIds = new Set(
      notes.filter(n => n.attachmentId === attachmentId).map(n => n.id),
    );
    return notes
      .filter(n => n.subject === subject && !attachmentNoteIds.has(n.id))
      .sort(sortByDate);
  }, [notes, subject, attachmentId]);

  const hasAttachmentNotes = pageGroups.size > 0 || generalNotes.length > 0;
  const hasAnyNotes = hasAttachmentNotes || subjectNotes.length > 0;

  const sortedPages = [...pageGroups.keys()].sort((a, b) => a - b);

  let body: ReactNode;
  if (!attachmentId && !subject) {
    body = <p className={styles.empty}>No subject or book associated with this file.</p>;
  } else if (!hasAnyNotes) {
    body = <p className={styles.empty}>No notes yet.</p>;
  } else {
    body = (
    <div>
      {/* Attachment-linked notes grouped by page */}
      {hasAttachmentNotes && (
        <ul className={styles.noteList}>
          {sortedPages.map(page => (
            <li key={`page-${page}`}>
              <div className={styles.pageGroupHeader}>Page {page}</div>
              <ul className={styles.noteList}>
                {pageGroups.get(page)!.map(note => (
                  <NoteItem
                    key={note.id}
                    note={note}
                    onNavigate={() => onNavigateToNote(note.id)}
                    onEdit={() => onEditNote(note.id)}
                  />
                ))}
              </ul>
            </li>
          ))}
          {generalNotes.length > 0 && (
            <li>
              {sortedPages.length > 0 && (
                <div className={styles.pageGroupHeader}>General</div>
              )}
              <ul className={styles.noteList}>
                {generalNotes.map(note => (
                  <NoteItem
                    key={note.id}
                    note={note}
                    onNavigate={() => onNavigateToNote(note.id)}
                    onEdit={() => onEditNote(note.id)}
                  />
                ))}
              </ul>
            </li>
          )}
        </ul>
      )}

      {/* Subject-linked notes (secondary) */}
      {subjectNotes.length > 0 && (
        <>
          {hasAttachmentNotes && (
            <div className={styles.sectionDivider}>
              <span>Subject: {subject}</span>
            </div>
          )}
          <ul className={styles.noteList}>
            {subjectNotes.map(note => (
              <NoteItem
                key={note.id}
                note={note}
                onNavigate={() => onNavigateToNote(note.id)}
                onEdit={() => onEditNote(note.id)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
    );
  }

  return (
    <div>
      <div className={styles.notesHeader}>
        <button
          className={styles.createNoteBtn}
          onClick={onCreateNote}
          title="Create note"
          aria-label="Create note"
        >
          <PlusIcon size={16} />
        </button>
      </div>
      {body}
    </div>
  );
}

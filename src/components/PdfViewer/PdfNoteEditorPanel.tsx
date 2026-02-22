import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Note } from '../../types/note';
import { NoteEditor } from '../NoteEditor/NoteEditor';
import styles from './PdfNoteEditorPanel.module.css';

interface Props {
  noteId: string;
  notes: Note[];
  saveNote: (note: Note) => void;
  onClose: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved';

export function PdfNoteEditorPanel({ noteId, notes, saveNote, onClose }: Props) {
  const note = useMemo(() => notes.find(n => n.id === noteId) ?? null, [notes, noteId]);

  const [title, setTitle] = useState(note?.title ?? '');
  const [content, setContent] = useState(note?.content ?? '');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevKeyRef = useRef('');

  // Re-initialize local state when the edited note changes (different note opened)
  const prevNoteIdRef = useRef(noteId);
  useEffect(() => {
    if (prevNoteIdRef.current !== noteId && note) {
      prevNoteIdRef.current = noteId;
      setTitle(note.title);
      setContent(note.content);
      prevKeyRef.current = '';
    }
  }, [noteId, note]);

  const debouncedSave = useCallback(
    (updatedNote: Note) => {
      const key = `${updatedNote.title}|${updatedNote.content}`;
      if (key === prevKeyRef.current) return;
      prevKeyRef.current = key;

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(() => {
        setSaveStatus('saving');
        saveNote({ ...updatedNote, updatedAt: new Date().toISOString() });
        setSaveStatus('saved');
        savedTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      }, 1500);
    },
    [saveNote],
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!note) return;
    debouncedSave({ ...note, title, content });
  }, [title, content, note, debouncedSave]);

  if (!note) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.errorMsg}>Note not found.</span>
          <button className={styles.closeBtn} onClick={onClose} title="Close editor">
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span
            className={`${styles.statusBadge} ${note.status === 'published' ? styles.published : styles.draft}`}
          >
            {note.status}
          </span>
          {saveStatus !== 'idle' && (
            <span className={styles.saveStatus}>
              {saveStatus === 'saving' ? 'Saving…' : 'Saved'}
            </span>
          )}
        </div>
        <div className={styles.headerRight}>
          <Link to={`/note/${noteId}/edit`} className={styles.fullEditorLink}>
            Open full editor ↗
          </Link>
          <button className={styles.closeBtn} onClick={onClose} title="Close editor">
            ✕
          </button>
        </div>
      </div>

      <div className={styles.titleRow}>
        <input
          className={styles.titleInput}
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Untitled"
          aria-label="Note title"
        />
      </div>

      <div className={styles.editorArea}>
        <NoteEditor value={content} onChange={setContent} />
      </div>
    </div>
  );
}

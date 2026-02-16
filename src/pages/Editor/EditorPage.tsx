import { useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { NoteEditor } from '../../components/NoteEditor/NoteEditor';
import { TagInput } from '../../components/TagInput/TagInput';
import { CategorySelect } from '../../components/CategorySelect/CategorySelect';
import { NoteToolbar } from '../../components/NoteToolbar/NoteToolbar';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useNotes } from '../../hooks/useNotes';
import { useTags } from '../../hooks/useTags';
import { useCategories } from '../../hooks/useCategories';
import { useSubjects } from '../../hooks/useSubjects';
import type { Note, NoteStatus } from '../../types/note';
import styles from './EditorPage.module.css';

function createNewNote(defaults?: { subject?: string; category?: string }): Note {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    title: '',
    content: '',
    tags: [],
    status: 'draft',
    category: defaults?.category,
    subject: defaults?.subject,
    createdAt: now,
    updatedAt: now,
  };
}

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { notes, saveNote, deleteNote } = useNotes();
  const { allTags } = useTags(notes);
  const { allCategories } = useCategories(notes);
  const { allSubjects } = useSubjects(notes);

  const [note, setNote] = useState<Note>(() => {
    if (id) {
      const existing = notes.find(n => n.id === id);
      if (existing) return existing;
    }
    return createNewNote({
      subject: searchParams.get('subject') || undefined,
    });
  });

  // Redirect if editing a non-existent note
  useEffect(() => {
    if (id && !notes.find(n => n.id === id) && note.createdAt !== note.updatedAt) {
      navigate('/note/new', { replace: true });
    }
  }, [id, notes, note, navigate]);

  const tagsKey = note.tags.join(',');
  const autoSaveNote = useMemo(() => note, [note.title, note.content, tagsKey, note.category, note.subject]);
  const saveStatus = useAutoSave(autoSaveNote);

  const updateField = useCallback(<K extends keyof Note>(field: K, value: Note[K]) => {
    setNote(prev => ({ ...prev, [field]: value, updatedAt: new Date().toISOString() }));
  }, []);

  const handleSave = useCallback(
    (status: NoteStatus) => {
      const updated = { ...note, status, updatedAt: new Date().toISOString() };
      saveNote(updated);
      setNote(updated);
      if (status === 'published') {
        navigate(`/note/${updated.id}`);
      }
    },
    [note, saveNote, navigate],
  );

  const handleDelete = useCallback(() => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      deleteNote(note.id);
      navigate('/notes');
    }
  }, [note.id, deleteNote, navigate]);

  // Keyboard shortcut: Ctrl+S to save draft
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave('draft');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const isExisting = !!id;

  return (
    <div className={styles.page}>
      <NoteToolbar
        status={note.status}
        saveStatus={saveStatus}
        onSaveDraft={() => handleSave('draft')}
        onPublish={() => handleSave('published')}
        onDelete={handleDelete}
        isExisting={isExisting}
      />
      <input
        type="text"
        className={styles.titleInput}
        value={note.title}
        onChange={e => updateField('title', e.target.value)}
        placeholder="Note title..."
      />
      <div className={styles.metaRow}>
        <CategorySelect
          value={note.category || ''}
          onChange={val => updateField('category', val || undefined)}
          suggestions={allCategories}
        />
        <input
          type="text"
          className={styles.subjectInput}
          value={note.subject || ''}
          onChange={e => updateField('subject', e.target.value || undefined)}
          placeholder="Subject..."
          list="subject-suggestions"
        />
        <datalist id="subject-suggestions">
          {allSubjects.map(s => <option key={s} value={s} />)}
        </datalist>
      </div>
      <div className={styles.tagsRow}>
        <TagInput
          tags={note.tags}
          onChange={tags => updateField('tags', tags)}
          suggestions={allTags}
        />
      </div>
      <NoteEditor
        value={note.content}
        onChange={value => updateField('content', value)}
      />
      <div className={styles.helpHint}>
        <details>
          <summary>LaTeX help</summary>
          <div className={styles.helpContent}>
            <p>
              <strong>Inline math:</strong> <code>{"`$$E = mc^2$$`"}</code>
            </p>
            <p>
              <strong>Block math:</strong> Use a fenced code block with language <code>katex</code>:
            </p>
            <pre>{"```katex\n\\int_0^\\infty e^{-x} dx = 1\n```"}</pre>
          </div>
        </details>
      </div>
    </div>
  );
}

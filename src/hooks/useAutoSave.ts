import { useEffect, useRef, useState, useCallback } from 'react';
import { noteStorage } from '../services/noteStorage';
import type { Note } from '../types/note';

export type SaveStatus = 'idle' | 'saving' | 'saved';

export function useAutoSave(note: Note | null, delayMs = 1500) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevNoteRef = useRef<string>('');

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (savedRef.current) clearTimeout(savedRef.current);
  }, []);

  useEffect(() => {
    if (!note) return;

    const noteKey = `${note.title}|${note.content}|${note.tags.join(',')}|${note.category || ''}|${note.subject || ''}`;
    if (noteKey === prevNoteRef.current) return;
    prevNoteRef.current = noteKey;

    clearTimers();

    timeoutRef.current = setTimeout(() => {
      setSaveStatus('saving');
      noteStorage.save({
        ...note,
        updatedAt: new Date().toISOString(),
      });
      setSaveStatus('saved');
      savedRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    }, delayMs);

    return clearTimers;
  }, [note, delayMs, clearTimers]);

  return saveStatus;
}

import { useState, useCallback } from 'react';
import { noteStorage } from '../services/noteStorage';
import type { Note } from '../types/note';

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>(() => noteStorage.getAll());

  const refresh = useCallback(() => {
    setNotes(noteStorage.getAll());
  }, []);

  const saveNote = useCallback((note: Note) => {
    noteStorage.save(note);
    refresh();
  }, [refresh]);

  const deleteNote = useCallback((id: string) => {
    noteStorage.delete(id);
    refresh();
  }, [refresh]);

  return { notes, saveNote, deleteNote, refresh };
}

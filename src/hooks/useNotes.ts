import { useState, useCallback, useEffect } from 'react';
import { noteStorage } from '../services/noteStorage';
import type { Note } from '../types/note';

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const all = await noteStorage.getAll();
    setNotes(all);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh(); // eslint-disable-line react-hooks/set-state-in-effect -- async data fetch on mount
  }, [refresh]);

  const saveNote = useCallback(async (note: Note) => {
    await noteStorage.save(note);
    await refresh();
  }, [refresh]);

  const deleteNote = useCallback(async (id: string) => {
    await noteStorage.delete(id);
    await refresh();
  }, [refresh]);

  return { notes, saveNote, deleteNote, refresh, loading };
}

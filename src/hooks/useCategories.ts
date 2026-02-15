import { useMemo } from 'react';
import type { Note } from '../types/note';

const DEFAULT_CATEGORIES = ['notes', 'exercises'];

export function useCategories(notes: Note[]) {
  const allCategories = useMemo(() => {
    const catSet = new Set<string>(DEFAULT_CATEGORIES);
    for (const note of notes) {
      if (note.category) {
        catSet.add(note.category);
      }
    }
    return Array.from(catSet).sort();
  }, [notes]);

  return { allCategories };
}

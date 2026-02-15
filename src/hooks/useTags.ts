import { useMemo } from 'react';
import type { Note } from '../types/note';

export function useTags(notes: Note[]) {
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const note of notes) {
      for (const tag of note.tags) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [notes]);

  return { allTags };
}

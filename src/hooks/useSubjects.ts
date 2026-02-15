import { useMemo } from 'react';
import type { Note } from '../types/note';

export function useSubjects(notes: Note[]) {
  const allSubjects = useMemo(() => {
    const subSet = new Set<string>();
    for (const note of notes) {
      if (note.subject) {
        subSet.add(note.subject);
      }
    }
    return Array.from(subSet).sort();
  }, [notes]);

  return { allSubjects };
}

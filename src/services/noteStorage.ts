import type { Note } from '../types/note';

const STORAGE_KEY = 'scribe_notes';

export const noteStorage = {
  getAll(): Note[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  },

  getById(id: string): Note | undefined {
    return this.getAll().find(n => n.id === id);
  },

  save(note: Note): void {
    const notes = this.getAll();
    const index = notes.findIndex(n => n.id === note.id);
    if (index >= 0) {
      notes[index] = note;
    } else {
      notes.push(note);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  },

  delete(id: string): void {
    const notes = this.getAll().filter(n => n.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  },
};

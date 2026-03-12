import type { Note } from '../types/note';

export const noteStorage = {
  async getAll(): Promise<Note[]> {
    const res = await fetch('/api/notes');
    if (!res.ok) throw new Error(`Failed to fetch notes: ${res.status}`);
    return res.json();
  },

  async getById(id: string): Promise<Note | undefined> {
    const res = await fetch(`/api/notes/${id}`);
    if (!res.ok) return undefined;
    return res.json();
  },

  async save(note: Note): Promise<void> {
    const res = await fetch(`/api/notes/${note.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note),
    });
    if (!res.ok) throw new Error(`Failed to save note: ${res.status}`);
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete note: ${res.status}`);
  },
};

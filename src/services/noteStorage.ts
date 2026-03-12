import type { Note } from '../types/note';

export const noteStorage = {
  async getAll(): Promise<Note[]> {
    const res = await fetch('/api/notes');
    return res.json();
  },

  async getById(id: string): Promise<Note | undefined> {
    const res = await fetch(`/api/notes/${id}`);
    if (!res.ok) return undefined;
    return res.json();
  },

  async save(note: Note): Promise<void> {
    await fetch(`/api/notes/${note.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note),
    });
  },

  async delete(id: string): Promise<void> {
    await fetch(`/api/notes/${id}`, { method: 'DELETE' });
  },
};

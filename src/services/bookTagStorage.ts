import type { BookTag } from '../types/bookTag';

export const bookTagStorage = {
  async getAll(): Promise<BookTag[]> {
    const res = await fetch('/api/book-tags');
    if (!res.ok) throw new Error(`Failed to fetch book tags: ${res.status}`);
    return res.json();
  },

  async create(name: string, color?: string): Promise<BookTag> {
    const res = await fetch('/api/book-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });
    if (!res.ok) throw new Error(`Failed to create book tag: ${res.status}`);
    return res.json();
  },

  async rename(id: string, name: string): Promise<void> {
    const res = await fetch(`/api/book-tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`Failed to rename book tag: ${res.status}`);
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/book-tags/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete book tag: ${res.status}`);
  },
};

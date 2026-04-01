import type { Folder } from '../types/folder';

export const folderStorage = {
  async getAll(): Promise<Folder[]> {
    const res = await fetch('/api/folders');
    if (!res.ok) throw new Error(`Failed to fetch folders: ${res.status}`);
    return res.json();
  },

  async create(name: string): Promise<Folder> {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`Failed to create folder: ${res.status}`);
    return res.json();
  },

  async rename(id: string, name: string): Promise<void> {
    const res = await fetch(`/api/folders/${id}/name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`Failed to rename folder: ${res.status}`);
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/folders/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete folder: ${res.status}`);
  },
};

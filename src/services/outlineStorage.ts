export interface FlatOutlineItem {
  id: string;
  attachmentId: string;
  parentId: string | null;
  title: string;
  pageNumber: number;
  destTop: number | null;
  sortOrder: number;
}

export const outlineStorage = {
  async getByAttachment(attachmentId: string): Promise<FlatOutlineItem[]> {
    const res = await fetch(`/api/outlines/${attachmentId}`);
    if (!res.ok) throw new Error('Failed to load custom outline');
    return res.json();
  },

  async saveAll(attachmentId: string, items: Omit<FlatOutlineItem, 'attachmentId'>[]): Promise<void> {
    const res = await fetch(`/api/outlines/${attachmentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error('Failed to save outline');
  },

  async addItem(
    attachmentId: string,
    item: { title: string; pageNumber: number; destTop: number | null; parentId?: string | null; sortOrder?: number },
  ): Promise<FlatOutlineItem> {
    const res = await fetch(`/api/outlines/${attachmentId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error('Failed to add outline item');
    return res.json();
  },

  async renameItem(id: string, title: string): Promise<void> {
    const res = await fetch(`/api/outlines/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error('Failed to rename outline item');
  },

  async deleteItem(id: string): Promise<void> {
    const res = await fetch(`/api/outlines/items/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete outline item');
  },

  async deleteAll(attachmentId: string): Promise<void> {
    const res = await fetch(`/api/outlines/${attachmentId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to reset outline');
  },
};

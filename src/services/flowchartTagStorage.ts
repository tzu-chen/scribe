import type { FlowchartTag } from '../types/flowchartTag';

export const flowchartTagStorage = {
  async getAll(): Promise<FlowchartTag[]> {
    const res = await fetch('/api/flowchart-tags');
    if (!res.ok) throw new Error(`Failed to fetch flowchart tags: ${res.status}`);
    return res.json();
  },

  async create(name: string, color?: string): Promise<FlowchartTag> {
    const res = await fetch('/api/flowchart-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });
    if (!res.ok) throw new Error(`Failed to create flowchart tag: ${res.status}`);
    return res.json();
  },

  async rename(id: string, name: string): Promise<void> {
    const res = await fetch(`/api/flowchart-tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`Failed to rename flowchart tag: ${res.status}`);
  },

  async update(id: string, patch: { name?: string; color?: string | null }): Promise<void> {
    const res = await fetch(`/api/flowchart-tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`Failed to update flowchart tag: ${res.status}`);
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/flowchart-tags/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete flowchart tag: ${res.status}`);
  },
};

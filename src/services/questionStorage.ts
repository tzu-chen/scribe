import type { Question } from '../types/question';

export const questionStorage = {
  async getAll(): Promise<Question[]> {
    const res = await fetch('/api/questions');
    if (!res.ok) throw new Error(`Failed to fetch questions: ${res.status}`);
    return res.json();
  },

  async save(question: Question): Promise<void> {
    const res = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(question),
    });
    if (!res.ok) throw new Error(`Failed to save question: ${res.status}`);
  },

  async setChecked(id: string, checked: boolean): Promise<void> {
    const res = await fetch(`/api/questions/${id}/checked`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked }),
    });
    if (!res.ok) throw new Error(`Failed to update question: ${res.status}`);
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/questions/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete question: ${res.status}`);
  },

  async getByNode(nodeId: string, flowchartId: string): Promise<Question[]> {
    const res = await fetch(
      `/api/questions/by-node?nodeId=${encodeURIComponent(nodeId)}&flowchartId=${encodeURIComponent(flowchartId)}`,
    );
    if (!res.ok) throw new Error(`Failed to fetch questions: ${res.status}`);
    return res.json();
  },

  async getCountsByNode(flowchartId: string): Promise<Record<string, number>> {
    const res = await fetch(
      `/api/questions/counts-by-node?flowchartId=${encodeURIComponent(flowchartId)}`,
    );
    if (!res.ok) throw new Error(`Failed to fetch question counts: ${res.status}`);
    return res.json();
  },
};

import type { Flowchart, FlowchartSummary, FlowchartSpec, FlowchartNodeRecord, FlowchartNodeWithFlowchart } from '../types/flowchart';

export const flowchartStorage = {
  async getAll(): Promise<FlowchartSummary[]> {
    const res = await fetch('/api/flowcharts');
    if (!res.ok) throw new Error(`Failed to fetch flowcharts: ${res.status}`);
    return res.json();
  },

  async getById(id: string): Promise<Flowchart | undefined> {
    const res = await fetch(`/api/flowcharts/${id}`);
    if (!res.ok) return undefined;
    return res.json();
  },

  async create(data: { name: string; description?: string; spec: FlowchartSpec }): Promise<Flowchart> {
    const res = await fetch('/api/flowcharts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to create flowchart: ${res.status}`);
    return res.json();
  },

  async update(id: string, data: { name: string; description?: string; spec: FlowchartSpec }): Promise<Flowchart> {
    const res = await fetch(`/api/flowcharts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to update flowchart: ${res.status}`);
    return res.json();
  },

  async updateMeta(id: string, data: { name?: string; description?: string }): Promise<Flowchart> {
    const res = await fetch(`/api/flowcharts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Failed to update flowchart: ${res.status}`);
    return res.json();
  },

  async setTags(id: string, tagIds: string[]): Promise<void> {
    const res = await fetch(`/api/flowcharts/${id}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds }),
    });
    if (!res.ok) throw new Error(`Failed to update flowchart tags: ${res.status}`);
  },

  async updateNode(flowchartId: string, nodeKey: string, updates: Record<string, unknown>): Promise<FlowchartNodeRecord> {
    const res = await fetch(`/api/flowcharts/${flowchartId}/nodes/${nodeKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`Failed to update node: ${res.status}`);
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/flowcharts/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete flowchart: ${res.status}`);
  },

  async getNodes(flowchartId: string): Promise<FlowchartNodeRecord[]> {
    const res = await fetch(`/api/flowcharts/${flowchartId}/nodes`);
    if (!res.ok) throw new Error(`Failed to fetch nodes: ${res.status}`);
    return res.json();
  },

  async searchNodes(title: string): Promise<FlowchartNodeRecord[]> {
    const res = await fetch(`/api/flowcharts/nodes/search?title=${encodeURIComponent(title)}`);
    if (!res.ok) throw new Error(`Failed to search nodes: ${res.status}`);
    return res.json();
  },

  async getAllNodes(): Promise<FlowchartNodeWithFlowchart[]> {
    const res = await fetch('/api/flowcharts/nodes/all');
    if (!res.ok) throw new Error(`Failed to fetch all nodes: ${res.status}`);
    return res.json();
  },

  async getNode(flowchartId: string, nodeKey: string): Promise<FlowchartNodeRecord | undefined> {
    const res = await fetch(`/api/flowcharts/nodes/${flowchartId}/${nodeKey}`);
    if (!res.ok) return undefined;
    return res.json();
  },
};

import type { AttachmentMeta } from '../types/attachment';

export class DuplicateAttachmentError extends Error {
  existing: AttachmentMeta;
  constructor(existing: AttachmentMeta) {
    super(`Duplicate attachment: ${existing.filename}`);
    this.name = 'DuplicateAttachmentError';
    this.existing = existing;
  }
}

export const attachmentStorage = {
  async getByNode(flowchartId: string, nodeKey: string): Promise<AttachmentMeta[]> {
    const params = new URLSearchParams({ flowchartId, nodeKey });
    const res = await fetch(`/api/attachments/by-node?${params}`);
    if (!res.ok) throw new Error(`Failed to fetch attachments by node: ${res.status}`);
    return res.json();
  },

  /** Returns counts keyed by node_key (within the given flowchart if provided). */
  async getCountsByNode(flowchartId?: string): Promise<Record<string, number>> {
    const url = flowchartId
      ? `/api/attachments/counts-by-node?flowchartId=${encodeURIComponent(flowchartId)}`
      : '/api/attachments/counts-by-node';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch attachment counts by node: ${res.status}`);
    return res.json();
  },

  async attachNode(id: string, flowchartId: string, nodeKey: string): Promise<void> {
    const res = await fetch(`/api/attachments/${id}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flowchartId, nodeKey }),
    });
    if (!res.ok) throw new Error(`Failed to attach node: ${res.status}`);
  },

  async detachNode(id: string, flowchartId: string, nodeKey: string): Promise<void> {
    const res = await fetch(`/api/attachments/${id}/nodes/${encodeURIComponent(flowchartId)}/${encodeURIComponent(nodeKey)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to detach node: ${res.status}`);
  },

  async add(subject: string, file: File, folderId?: string | null): Promise<AttachmentMeta> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('subject', subject);
    if (folderId) formData.append('folder_id', folderId);
    const res = await fetch('/api/attachments', {
      method: 'POST',
      body: formData,
    });
    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      if (body?.duplicate) throw new DuplicateAttachmentError(body.duplicate);
    }
    if (!res.ok) throw new Error(`Failed to upload attachment: ${res.status}`);
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/attachments/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to delete attachment: ${res.status}`);
  },

  async getBlob(id: string): Promise<Blob | null> {
    const res = await fetch(`/api/attachments/${id}/blob`);
    if (!res.ok) return null;
    return res.blob();
  },

  async getAll(): Promise<AttachmentMeta[]> {
    const res = await fetch('/api/attachments');
    if (!res.ok) throw new Error(`Failed to fetch attachments: ${res.status}`);
    return res.json();
  },

  async addFromBlob(subject: string, filename: string, type: string, blob: Blob): Promise<AttachmentMeta> {
    const file = new File([blob], filename, { type });
    return this.add(subject, file);
  },

  async rename(id: string, filename: string): Promise<void> {
    const res = await fetch(`/api/attachments/${id}/filename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    });
    if (!res.ok) throw new Error(`Failed to rename attachment: ${res.status}`);
  },

  async setTags(id: string, tagIds: string[]): Promise<void> {
    const res = await fetch(`/api/attachments/${id}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds }),
    });
    if (!res.ok) throw new Error(`Failed to update attachment tags: ${res.status}`);
  },

  async moveToFolder(id: string, folderId: string | null): Promise<void> {
    const res = await fetch(`/api/attachments/${id}/folder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });
    if (!res.ok) throw new Error(`Failed to move attachment: ${res.status}`);
  },

  async markOpened(id: string): Promise<void> {
    const res = await fetch(`/api/attachments/${id}/last-opened`, {
      method: 'PATCH',
    });
    if (!res.ok) throw new Error(`Failed to mark attachment opened: ${res.status}`);
  },

  async openFile(id: string): Promise<void> {
    const blob = await this.getBlob(id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    // Fetch metadata to get filename
    const allMeta = await this.getAll();
    const meta = allMeta.find(m => m.id === id);
    a.download = meta?.filename ?? 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
};

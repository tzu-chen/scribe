import type { ScanSummary, Source, SourcePreview, SourceSettings } from '../types/source';

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : `${fallback}: ${res.status}`;
}

export const sourceStorage = {
  async getAll(): Promise<Source[]> {
    const res = await fetch('/api/sources');
    if (!res.ok) throw new Error(`Failed to fetch linked folders: ${res.status}`);
    return res.json();
  },

  /** Dry run: what the settings would take in. Pass sourceId when editing an existing folder. */
  async preview(settings: SourceSettings, sourceId?: string): Promise<SourcePreview> {
    const res = await fetch('/api/sources/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, sourceId }),
    });
    if (!res.ok) throw new Error(await errorMessage(res, 'Failed to preview folder'));
    return res.json();
  },

  async create(settings: SourceSettings & { name?: string; adoptIds?: string[] }): Promise<{ source: Source; summary: ScanSummary }> {
    const res = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error(await errorMessage(res, 'Failed to link folder'));
    return res.json();
  },

  async update(id: string, patch: Partial<SourceSettings> & { name?: string }): Promise<{ source: Source; summary: ScanSummary }> {
    const res = await fetch(`/api/sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(await errorMessage(res, 'Failed to update linked folder'));
    return res.json();
  },

  /** Unlink: the folder's items leave the library; files on disk are untouched. */
  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/sources/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to unlink folder: ${res.status}`);
  },

  async scan(id: string): Promise<ScanSummary> {
    const res = await fetch(`/api/sources/${id}/scan`, { method: 'POST' });
    if (!res.ok) throw new Error(await errorMessage(res, 'Failed to rescan folder'));
    return res.json();
  },

  /** Catch up on every folder (the server skips ones scanned seconds ago). */
  async scanAll(): Promise<{ changed: boolean }> {
    const res = await fetch('/api/sources/scan', { method: 'POST' });
    if (!res.ok) throw new Error(`Failed to rescan folders: ${res.status}`);
    return res.json();
  },

  async removeMissing(id: string): Promise<number> {
    const res = await fetch(`/api/sources/${id}/missing`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Failed to remove missing items: ${res.status}`);
    return (await res.json()).removed;
  },

  /** Calls `onChange` whenever a folder's contents change on disk. Returns an unsubscribe function. */
  subscribe(onChange: (sourceId: string) => void): () => void {
    const events = new EventSource('/api/sources/events');
    events.onmessage = e => {
      try {
        onChange(JSON.parse(e.data).sourceId);
      } catch {
        /* malformed event */
      }
    };
    return () => events.close();
  },
};

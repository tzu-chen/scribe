import type { ReadingTimeEntry } from '../types/readingTime';

/**
 * Returns the CST (UTC-6) calendar date string for a given JS Date.
 * CST is a fixed offset; this does NOT account for CDT.
 */
export function getCSTDateString(date: Date = new Date()): string {
  const cstOffsetMs = 6 * 60 * 60 * 1000;
  const cstTime = new Date(date.getTime() - cstOffsetMs);
  return cstTime.toISOString().slice(0, 10);
}

export const readingTimeStorage = {
  async addSeconds(
    attachmentId: string,
    filename: string,
    dateCST: string,
    seconds: number,
  ): Promise<void> {
    await fetch('/api/reading-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachmentId, filename, dateCST, seconds }),
    });
  },

  async getAll(): Promise<ReadingTimeEntry[]> {
    const res = await fetch('/api/reading-time');
    return res.json() as Promise<ReadingTimeEntry[]>;
  },

  async getByDateRange(startCST: string, endCST: string): Promise<ReadingTimeEntry[]> {
    const params = new URLSearchParams({ start: startCST, end: endCST });
    const res = await fetch(`/api/reading-time?${params}`);
    return res.json() as Promise<ReadingTimeEntry[]>;
  },
};

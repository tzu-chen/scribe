import type { ReadingTimeEntry, ReadingTimeMap } from '../types/readingTime';

const STORAGE_KEY = 'scribe_reading_time';

function makeKey(attachmentId: string, dateCST: string): string {
  return `${attachmentId}::${dateCST}`;
}

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
  _load(): ReadingTimeMap {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  },

  _save(map: ReadingTimeMap): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  },

  addSeconds(
    attachmentId: string,
    filename: string,
    dateCST: string,
    seconds: number,
  ): void {
    const map = this._load();
    const key = makeKey(attachmentId, dateCST);
    const existing = map[key];
    if (existing) {
      existing.totalSeconds += seconds;
      if (filename) existing.filename = filename;
    } else {
      map[key] = { attachmentId, filename, dateCST, totalSeconds: seconds };
    }
    this._save(map);
  },

  getAll(): ReadingTimeEntry[] {
    const map = this._load();
    return Object.values(map);
  },

  getByDateRange(startCST: string, endCST: string): ReadingTimeEntry[] {
    return this.getAll().filter(
      (e) => e.dateCST >= startCST && e.dateCST <= endCST,
    );
  },
};

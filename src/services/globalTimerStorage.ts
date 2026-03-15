import { getCSTDateString } from './readingTimeStorage';

const STORAGE_KEY = 'scribe_global_timer';

interface GlobalTimerData {
  dateCST: string;
  totalSeconds: number;
}

export const globalTimerStorage = {
  load(): GlobalTimerData {
    const today = getCSTDateString();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as GlobalTimerData;
        if (data.dateCST === today) {
          return data;
        }
      }
    } catch {
      // Ignore parse errors
    }
    return { dateCST: today, totalSeconds: 0 };
  },

  save(dateCST: string, totalSeconds: number): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dateCST, totalSeconds }));
  },
};

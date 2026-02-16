import { useState, useMemo, useCallback } from 'react';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
} from 'date-fns';
import { readingTimeStorage, getCSTDateString } from '../services/readingTimeStorage';

export type ViewMode = 'week' | 'month';

export interface DayData {
  dateCST: string;
  label: string;
  books: Record<string, number>;
}

export interface BookInfo {
  attachmentId: string;
  filename: string;
  color: string;
}

const BOOK_COLORS = [
  '#4263eb',
  '#e03131',
  '#2f9e44',
  '#f08c00',
  '#7c3aed',
  '#0891b2',
  '#d63865',
  '#059669',
  '#ea580c',
  '#6d28d9',
  '#0077b6',
  '#b45309',
];

export function useReadingSummary() {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const { days, books, totalSeconds } = useMemo(() => {
    // refreshKey is used to force recomputation
    void refreshKey;

    const todayCST = getCSTDateString();
    const todayDate = new Date(todayCST + 'T12:00:00');

    let rangeStart: Date;
    let rangeEnd: Date;

    if (viewMode === 'week') {
      rangeStart = startOfWeek(todayDate, { weekStartsOn: 0 });
      rangeEnd = endOfWeek(todayDate, { weekStartsOn: 0 });
    } else {
      rangeStart = startOfMonth(todayDate);
      rangeEnd = endOfMonth(todayDate);
    }

    const startCST = format(rangeStart, 'yyyy-MM-dd');
    const endCST = format(rangeEnd, 'yyyy-MM-dd');
    const entries = readingTimeStorage.getByDateRange(startCST, endCST);

    const allDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
    const dayMap = new Map<string, DayData>();
    for (const d of allDays) {
      const dateStr = format(d, 'yyyy-MM-dd');
      dayMap.set(dateStr, {
        dateCST: dateStr,
        label: viewMode === 'week' ? format(d, 'EEE') : format(d, 'MMM d'),
        books: {},
      });
    }

    const bookMap = new Map<string, BookInfo>();
    for (const entry of entries) {
      const day = dayMap.get(entry.dateCST);
      if (day) {
        day.books[entry.attachmentId] =
          (day.books[entry.attachmentId] || 0) + entry.totalSeconds;
      }
      if (!bookMap.has(entry.attachmentId)) {
        bookMap.set(entry.attachmentId, {
          attachmentId: entry.attachmentId,
          filename: entry.filename,
          color: BOOK_COLORS[bookMap.size % BOOK_COLORS.length],
        });
      }
    }

    const daysArray = Array.from(dayMap.values());
    const booksArray = Array.from(bookMap.values());
    const total = entries.reduce((sum, e) => sum + e.totalSeconds, 0);

    return { days: daysArray, books: booksArray, totalSeconds: total };
  }, [viewMode, refreshKey]);

  return { viewMode, setViewMode, days, books, totalSeconds, refresh };
}

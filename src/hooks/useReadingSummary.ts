import { useState, useEffect, useCallback } from 'react';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
} from 'date-fns';
import { readingTimeStorage, getCSTDateString } from '../services/readingTimeStorage';
import type { ReadingTimeEntry } from '../types/readingTime';

export type ViewMode = 'week' | 'month';

export interface DayData {
  dateCST: string;
  label: string;
  books: Record<string, number>;
}

export interface BookInfo {
  attachmentId: string;
  filename: string;
  displayName: string;
  color: string;
  totalSeconds: number;
  roundedSeconds: number;
}

function stripPdfExtension(filename: string): string {
  return filename.replace(/\.pdf$/i, '');
}

function roundDown30Min(totalSeconds: number): number {
  return Math.floor(totalSeconds / 1800) * 1800;
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

function hashStringToIndex(str: string, mod: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return ((hash % mod) + mod) % mod;
}

function computeSummary(entries: ReadingTimeEntry[], viewMode: ViewMode) {
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
  // Skip entries with empty filenames (caused by a previous bug)
  const validEntries = entries.filter((e) => e.filename);
  for (const entry of validEntries) {
    const day = dayMap.get(entry.dateCST);
    if (day) {
      day.books[entry.attachmentId] =
        (day.books[entry.attachmentId] || 0) + entry.totalSeconds;
    }
    if (!bookMap.has(entry.attachmentId)) {
      bookMap.set(entry.attachmentId, {
        attachmentId: entry.attachmentId,
        filename: entry.filename,
        displayName: stripPdfExtension(entry.filename),
        color: BOOK_COLORS[hashStringToIndex(entry.attachmentId, BOOK_COLORS.length)],
        totalSeconds: 0,
        roundedSeconds: 0,
      });
    }
  }

  const daysArray = Array.from(dayMap.values());
  const booksArray = Array.from(bookMap.values());

  for (const book of booksArray) {
    const bookTotal = daysArray.reduce(
      (sum, day) => sum + (day.books[book.attachmentId] || 0),
      0,
    );
    book.totalSeconds = bookTotal;
    book.roundedSeconds = roundDown30Min(bookTotal);
  }

  // Only show books with at least 30 minutes of reading time
  const filteredBooks = booksArray.filter((book) => book.roundedSeconds >= 1800);

  const total = roundDown30Min(validEntries.reduce((sum, e) => sum + e.totalSeconds, 0));

  return { days: daysArray, books: filteredBooks, totalSeconds: total };
}

export function useReadingSummary() {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [days, setDays] = useState<DayData[]>([]);
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const resetAll = useCallback(async () => {
    await readingTimeStorage.deleteAll();
    refresh();
  }, [refresh]);

  useEffect(() => {
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

    readingTimeStorage.getByDateRange(startCST, endCST).then((entries) => {
      const result = computeSummary(entries, viewMode);
      setDays(result.days);
      setBooks(result.books);
      setTotalSeconds(result.totalSeconds);
    });
  }, [viewMode, refreshKey]);

  return { viewMode, setViewMode, days, books, totalSeconds, refresh, resetAll };
}

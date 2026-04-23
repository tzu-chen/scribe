import { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface OpenBookTab {
  id: string;
  filename: string;
}

interface OpenBooksContextValue {
  tabs: OpenBookTab[];
  lastActiveId: string | null;
  openBook: (id: string, filename: string) => void;
  closeBook: (id: string) => OpenBookTab[];
}

const STORAGE_KEY = 'scribe_open_books';
const LAST_ACTIVE_KEY = 'scribe_open_books_last_active';

const OpenBooksContext = createContext<OpenBooksContextValue | null>(null);

function loadTabs(): OpenBookTab[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is OpenBookTab =>
        t && typeof t.id === 'string' && typeof t.filename === 'string',
    );
  } catch {
    return [];
  }
}

function loadLastActive(): string | null {
  return localStorage.getItem(LAST_ACTIVE_KEY);
}

export function OpenBooksProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<OpenBookTab[]>(() => loadTabs());
  const [lastActiveId, setLastActiveId] = useState<string | null>(() => loadLastActive());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    if (lastActiveId) {
      localStorage.setItem(LAST_ACTIVE_KEY, lastActiveId);
    } else {
      localStorage.removeItem(LAST_ACTIVE_KEY);
    }
  }, [lastActiveId]);

  const openBook = useCallback((id: string, filename: string) => {
    setTabs(prev => {
      const existing = prev.find(t => t.id === id);
      if (existing) {
        if (existing.filename === filename) return prev;
        return prev.map(t => (t.id === id ? { ...t, filename } : t));
      }
      return [...prev, { id, filename }];
    });
    setLastActiveId(id);
  }, []);

  const closeBook = useCallback((id: string) => {
    let next: OpenBookTab[] = [];
    setTabs(prev => {
      next = prev.filter(t => t.id !== id);
      return next;
    });
    setLastActiveId(prev => {
      if (prev !== id) return prev;
      return next.length > 0 ? next[next.length - 1].id : null;
    });
    return next;
  }, []);

  return (
    <OpenBooksContext.Provider value={{ tabs, lastActiveId, openBook, closeBook }}>
      {children}
    </OpenBooksContext.Provider>
  );
}

export function useOpenBooks(): OpenBooksContextValue {
  const ctx = useContext(OpenBooksContext);
  if (!ctx) throw new Error('useOpenBooks must be used within an OpenBooksProvider');
  return ctx;
}

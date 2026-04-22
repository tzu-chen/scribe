import { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface OpenBookTab {
  id: string;
  filename: string;
}

interface OpenBooksContextValue {
  tabs: OpenBookTab[];
  openBook: (id: string, filename: string) => void;
  closeBook: (id: string) => OpenBookTab[];
}

const STORAGE_KEY = 'scribe_open_books';

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

export function OpenBooksProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<OpenBookTab[]>(() => loadTabs());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  }, [tabs]);

  const openBook = useCallback((id: string, filename: string) => {
    setTabs(prev => {
      const existing = prev.find(t => t.id === id);
      if (existing) {
        if (existing.filename === filename) return prev;
        return prev.map(t => (t.id === id ? { ...t, filename } : t));
      }
      return [...prev, { id, filename }];
    });
  }, []);

  const closeBook = useCallback((id: string) => {
    let next: OpenBookTab[] = [];
    setTabs(prev => {
      next = prev.filter(t => t.id !== id);
      return next;
    });
    return next;
  }, []);

  return (
    <OpenBooksContext.Provider value={{ tabs, openBook, closeBook }}>
      {children}
    </OpenBooksContext.Provider>
  );
}

export function useOpenBooks(): OpenBooksContextValue {
  const ctx = useContext(OpenBooksContext);
  if (!ctx) throw new Error('useOpenBooks must be used within an OpenBooksProvider');
  return ctx;
}

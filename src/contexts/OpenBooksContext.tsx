import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { attachmentStorage } from '../services/attachmentStorage';
import {
  loadPdfDocument,
  loadDjvuDocument,
  isDjvuBlob,
  type OutlineItem,
  type DjvuDocument,
  type PageDims,
} from '../services/documentLoader';

export interface OpenBookTab {
  id: string;
  filename: string;
}

export type DocStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TabDocState {
  blob: Blob | null;
  pdfDoc: PDFDocumentProxy | null;
  djvuDoc: DjvuDocument | null;
  isDjvu: boolean;
  numPages: number;
  pageWidth: number;
  pageHeight: number;
  pageDimensions: PageDims[];
  outline: OutlineItem[];
  status: DocStatus;
  error: string | null;
}

export const EMPTY_DOC: TabDocState = {
  blob: null,
  pdfDoc: null,
  djvuDoc: null,
  isDjvu: false,
  numPages: 0,
  pageWidth: 612,
  pageHeight: 792,
  pageDimensions: [],
  outline: [],
  status: 'idle',
  error: null,
};

interface OpenBooksContextValue {
  tabs: OpenBookTab[];
  lastActiveId: string | null;
  activeId: string | null;
  docs: Record<string, TabDocState>;
  openBook: (id: string, filename: string) => void;
  closeBook: (id: string) => OpenBookTab[];
  setActiveId: (id: string | null) => void;
  /** Marks an id as most-recently-used. Used by the LRU eviction policy to
   *  keep recently-active docs hot. Safe to call repeatedly. */
  touchTab: (id: string) => void;
  /** Ensures the given tab's doc is loaded (re-load if it was LRU-evicted).
   *  No-op for already-loaded or in-flight loads. */
  prefetchTab: (id: string) => void;
}

/** Soft cap on the number of fully-parsed PDF/DjVu documents kept in memory.
 *  When exceeded, the least-recently-touched ready docs are destroyed; their
 *  tabs stay in the bar and re-load on next access. */
const MAX_LOADED_DOCS = 6;

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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, TabDocState>>({});

  // Refs for cross-async coordination so we don't lose track of which loads
  // are in flight (loadingRef) or have been invalidated by tab close (cancelledRef).
  const loadingRef = useRef<Set<string>>(new Set());
  const cancelledRef = useRef<Set<string>>(new Set());
  const docsRef = useRef(docs);
  docsRef.current = docs;
  // LRU order, most-recent first. Drives eviction when the loaded-doc count
  // exceeds MAX_LOADED_DOCS. Stored in a ref because eviction reads it during
  // the docs effect and doesn't need to trigger re-renders.
  const lruOrderRef = useRef<string[]>([]);

  const touchTab = useCallback((id: string) => {
    lruOrderRef.current = [id, ...lruOrderRef.current.filter(x => x !== id)];
  }, []);

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

  const startLoad = useCallback(async (id: string, filename: string) => {
    if (loadingRef.current.has(id)) return;
    loadingRef.current.add(id);
    cancelledRef.current.delete(id);
    setDocs(prev => ({ ...prev, [id]: { ...EMPTY_DOC, status: 'loading' } }));

    try {
      const blob = await attachmentStorage.getBlob(id);
      if (cancelledRef.current.has(id)) return;
      if (!blob) {
        setDocs(prev => ({
          ...prev,
          [id]: { ...EMPTY_DOC, status: 'error', error: 'Attachment not found.' },
        }));
        return;
      }

      const dj = isDjvuBlob(blob, filename);
      if (dj) {
        const r = await loadDjvuDocument(blob);
        if (cancelledRef.current.has(id)) return;
        setDocs(prev => ({
          ...prev,
          [id]: {
            blob,
            pdfDoc: null,
            djvuDoc: r.djvuDoc,
            isDjvu: true,
            numPages: r.numPages,
            pageWidth: r.pageDimensions[0]?.width ?? 612,
            pageHeight: r.pageDimensions[0]?.height ?? 792,
            pageDimensions: r.pageDimensions,
            outline: r.outline,
            status: 'ready',
            error: null,
          },
        }));
      } else {
        const r = await loadPdfDocument(blob);
        if (cancelledRef.current.has(id)) {
          // Tab was closed mid-load — release the loaded doc.
          r.pdfDoc.destroy();
          return;
        }
        setDocs(prev => ({
          ...prev,
          [id]: {
            blob,
            pdfDoc: r.pdfDoc,
            djvuDoc: null,
            isDjvu: false,
            numPages: r.numPages,
            pageWidth: r.pageDimensions[0]?.width ?? 612,
            pageHeight: r.pageDimensions[0]?.height ?? 792,
            pageDimensions: r.pageDimensions,
            outline: r.outline,
            status: 'ready',
            error: null,
          },
        }));
      }
    } catch (e) {
      if (cancelledRef.current.has(id)) return;
      setDocs(prev => ({
        ...prev,
        [id]: {
          ...EMPTY_DOC,
          status: 'error',
          error: e instanceof Error ? e.message : 'Failed to load',
        },
      }));
    } finally {
      loadingRef.current.delete(id);
      cancelledRef.current.delete(id);
    }
  }, []);

  // Whenever the tab list changes, kick off loads for new tabs and tear down
  // docs for tabs that were just closed. Runs on mount too, so tabs restored
  // from localStorage start loading immediately — that's the whole point of
  // Phase 1: by the time the user clicks a tab, the doc is already cached.
  useEffect(() => {
    // Start loads for tabs that don't have a doc state yet (or were evicted
    // to 'idle' status by the LRU cap and need to be re-fetched).
    for (const tab of tabs) {
      const state = docsRef.current[tab.id];
      const needsLoad = !state || state.status === 'idle';
      if (needsLoad && !loadingRef.current.has(tab.id)) {
        startLoad(tab.id, tab.filename);
      }
    }

    // Tear down docs whose tabs were closed.
    const openIds = new Set(tabs.map(t => t.id));
    const removed: string[] = [];
    for (const id of Object.keys(docsRef.current)) {
      if (!openIds.has(id)) {
        removed.push(id);
        const s = docsRef.current[id];
        s.pdfDoc?.destroy();
        // If a load is still in flight for this id, mark it cancelled so the
        // result is dropped (and any loaded PDFDocumentProxy is destroyed) when
        // it resolves.
        if (loadingRef.current.has(id)) cancelledRef.current.add(id);
      }
    }
    if (removed.length > 0) {
      setDocs(prev => {
        const next: Record<string, TabDocState> = {};
        for (const id of Object.keys(prev)) {
          if (!removed.includes(id)) next[id] = prev[id];
        }
        return next;
      });
    }
  }, [tabs, startLoad]);

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
    touchTab(id);
  }, [touchTab]);

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
    lruOrderRef.current = lruOrderRef.current.filter(x => x !== id);
    return next;
  }, []);

  const prefetchTab = useCallback((id: string) => {
    const state = docsRef.current[id];
    if (state && state.status !== 'idle') return;
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    if (!loadingRef.current.has(id)) startLoad(id, tab.filename);
  }, [tabs, startLoad]);

  // LRU eviction: when more than MAX_LOADED_DOCS docs are in 'ready' state,
  // destroy the least-recently-touched ones (keeping the active tab and the
  // most recent N-1). Evicted tabs return to 'idle' status; clicking them
  // re-triggers the load via the effect above.
  useEffect(() => {
    const readyIds = Object.entries(docs)
      .filter(([, s]) => s.status === 'ready')
      .map(([id]) => id);
    if (readyIds.length <= MAX_LOADED_DOCS) return;

    const readySet = new Set(readyIds);
    // Walk LRU order (most-recent first), pick the first MAX that are ready.
    const keep = new Set<string>();
    for (const id of lruOrderRef.current) {
      if (readySet.has(id)) {
        keep.add(id);
        if (keep.size >= MAX_LOADED_DOCS) break;
      }
    }
    // Anything ready but not in `keep` is fair game.
    const evictees = readyIds.filter(id => !keep.has(id));
    if (evictees.length === 0) return;

    for (const id of evictees) {
      docs[id].pdfDoc?.destroy();
    }
    setDocs(prev => {
      const next = { ...prev };
      for (const id of evictees) {
        next[id] = { ...EMPTY_DOC };
      }
      return next;
    });
  }, [docs]);

  return (
    <OpenBooksContext.Provider
      value={{
        tabs,
        lastActiveId,
        activeId,
        docs,
        openBook,
        closeBook,
        setActiveId,
        touchTab,
        prefetchTab,
      }}
    >
      {children}
    </OpenBooksContext.Provider>
  );
}

export function useOpenBooks(): OpenBooksContextValue {
  const ctx = useContext(OpenBooksContext);
  if (!ctx) throw new Error('useOpenBooks must be used within an OpenBooksProvider');
  return ctx;
}

export function useTabDocument(id: string | null | undefined): TabDocState {
  const ctx = useOpenBooks();
  if (!id) return EMPTY_DOC;
  return ctx.docs[id] ?? EMPTY_DOC;
}

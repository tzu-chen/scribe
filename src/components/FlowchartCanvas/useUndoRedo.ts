import { useState, useCallback, useMemo } from 'react';

// Generic undo/redo for the editor's spec. `replace` mutates the present
// without a history entry (used for live drag frames); `commit` and `pushPast`
// record an undoable step. The page brackets a gesture with a captured
// snapshot + `pushPast` so an entire drag collapses into one undo step.

interface History<T> {
  past: T[];
  present: T | null;
  future: T[];
}

const MAX_HISTORY = 60;

function capPast<T>(past: T[]): T[] {
  return past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past;
}

export function useUndoRedo<T>() {
  const [hist, setHist] = useState<History<T>>({ past: [], present: null, future: [] });

  /** Initialize/replace the whole history with a fresh value (e.g. on load). */
  const reset = useCallback((value: T) => {
    setHist({ past: [], present: value, future: [] });
  }, []);

  /** Apply a change and record it as a single undoable step. */
  const commit = useCallback((next: T | ((prev: T) => T)) => {
    setHist((h) => {
      if (h.present === null) return h;
      const value = typeof next === 'function' ? (next as (prev: T) => T)(h.present) : next;
      return { past: capPast([...h.past, h.present]), present: value, future: [] };
    });
  }, []);

  /** Replace the present without touching history (live drag/resize frames). */
  const replace = useCallback((next: T | ((prev: T) => T)) => {
    setHist((h) => {
      if (h.present === null) return h;
      const value = typeof next === 'function' ? (next as (prev: T) => T)(h.present) : next;
      return { ...h, present: value };
    });
  }, []);

  /** Push a pre-gesture snapshot onto the undo stack (present already updated). */
  const pushPast = useCallback((snapshot: T) => {
    setHist((h) => ({ past: capPast([...h.past, snapshot]), present: h.present, future: [] }));
  }, []);

  const undo = useCallback(() => {
    setHist((h) => {
      if (h.past.length === 0 || h.present === null) return h;
      const previous = h.past[h.past.length - 1];
      return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setHist((h) => {
      if (h.future.length === 0 || h.present === null) return h;
      const next = h.future[0];
      return { past: capPast([...h.past, h.present]), present: next, future: h.future.slice(1) };
    });
  }, []);

  const canUndo = hist.past.length > 0;
  const canRedo = hist.future.length > 0;

  return useMemo(
    () => ({ present: hist.present, reset, commit, replace, pushPast, undo, redo, canUndo, canRedo }),
    [hist.present, reset, commit, replace, pushPast, undo, redo, canUndo, canRedo],
  );
}

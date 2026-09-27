import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

/** Browse list columns, in display order. */
export type ListColumn = 'title' | 'kind' | 'projects' | 'tags' | 'progress' | 'opened' | 'added';

type ColumnWidths = Record<ListColumn, number>;

const STORAGE_KEY = 'scribe_library_columns';

/** Together these fill the capped page width, so the default table never scrolls sideways. */
const DEFAULT_WIDTHS: ColumnWidths = {
  title: 346,
  kind: 84,
  projects: 96,
  tags: 96,
  progress: 116,
  opened: 100,
  added: 108,
};

const MIN_WIDTH = 48;
const MIN_TITLE_WIDTH = 120;

const minWidth = (col: ListColumn) => (col === 'title' ? MIN_TITLE_WIDTH : MIN_WIDTH);

function loadWidths(): ColumnWidths {
  const widths = { ...DEFAULT_WIDTHS };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved && typeof saved === 'object') {
      for (const col of Object.keys(DEFAULT_WIDTHS) as ListColumn[]) {
        const w = (saved as Record<string, unknown>)[col];
        if (typeof w === 'number' && Number.isFinite(w)) widths[col] = Math.max(minWidth(col), Math.round(w));
      }
    }
  } catch { /* storage unavailable or corrupt: defaults */ }
  return widths;
}

// The release that ends a drag would otherwise land as a click on the header and re-sort.
function swallowClick(e: MouseEvent) {
  e.stopPropagation();
  e.preventDefault();
}

/**
 * Resizable column widths for the Library list table, persisted per browser.
 * Widths are exposed as `--col-<name>` custom properties on the table; while
 * dragging, only the property is updated, so the rows don't re-render per move.
 */
export function useListColumns() {
  const [widths, setWidths] = useState<ColumnWidths>(loadWidths);
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(widths)); } catch { /* ignore */ }
  }, [widths]);

  const startResize = useCallback((col: ListColumn, e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const table = tableRef.current;
    if (!table) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startWidth = widths[col];
    let width = startWidth;
    handle.setPointerCapture(pointerId);

    const onMove = (ev: PointerEvent) => {
      width = Math.max(minWidth(col), Math.round(startWidth + ev.clientX - startX));
      table.style.setProperty(`--col-${col}`, `${width}px`);
    };
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      window.addEventListener('click', swallowClick, true);
      setTimeout(() => window.removeEventListener('click', swallowClick, true), 0);
      if (width !== startWidth) setWidths(prev => ({ ...prev, [col]: width }));
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  }, [widths]);

  const resetWidth = useCallback((col: ListColumn) => {
    setWidths(prev => ({ ...prev, [col]: DEFAULT_WIDTHS[col] }));
  }, []);

  const tableStyle = Object.fromEntries(
    Object.entries(widths).map(([col, w]) => [`--col-${col}`, `${w}px`]),
  ) as CSSProperties;

  return { tableRef, tableStyle, startResize, resetWidth };
}

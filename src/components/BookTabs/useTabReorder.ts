import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

/** Pointer travel (px) before a press on a tab becomes a drag instead of a click. */
const DRAG_THRESHOLD = 4;

interface DragState {
  id: string;
  from: number;
  /** Index the dragged tab would take if dropped now. */
  over: number;
  /** Dragged tab's offset from its slot, clamped to the bar. */
  dx: number;
  width: number;
}

// The release that ends a drag would otherwise land as a click and switch tabs.
function swallowClick(e: MouseEvent) {
  e.stopPropagation();
  e.preventDefault();
}

/**
 * Drag-to-reorder for the book tab bar. The dragged tab follows the pointer
 * and the tabs it passes slide aside; the new order is committed on release.
 * Escape cancels. Touch is left alone so the bar still scrolls by swiping.
 */
export function useTabReorder(ids: string[], onMove: (id: string, toIndex: number) => void) {
  const barRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => () => abortRef.current?.(), []);

  const startDrag = useCallback((id: string, e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    if ((e.target as HTMLElement).closest('button')) return;
    const bar = barRef.current;
    const from = ids.indexOf(id);
    if (!bar || from < 0) return;

    const tab = e.currentTarget;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startScroll = bar.scrollLeft;
    let lastX = startX;
    let phase: 'pending' | 'dragging' | 'cancelled' = 'pending';
    // Slots in the bar's scroll coordinates. Transforms don't affect layout,
    // so they hold for the whole drag.
    let slots: { left: number; width: number }[] = [];
    let over = from;
    tab.setPointerCapture(pointerId);

    const update = () => {
      if (phase === 'cancelled') return;
      const raw = lastX - startX + bar.scrollLeft - startScroll;
      if (phase === 'pending') {
        if (Math.abs(raw) < DRAG_THRESHOLD) return;
        phase = 'dragging';
        slots = Array.from(bar.children, el => ({
          left: (el as HTMLElement).offsetLeft,
          width: (el as HTMLElement).offsetWidth,
        }));
      }
      const self = slots[from];
      const last = slots[slots.length - 1];
      const dx = Math.min(
        Math.max(raw, slots[0].left - self.left),
        last.left + last.width - (self.left + self.width),
      );
      // A neighbour gives way once the dragged tab's leading edge crosses its
      // midpoint. (Its centre can't always: clamped to the bar, a wide tab's
      // centre never gets past a narrow first or last tab's.)
      const left = self.left + dx;
      const right = left + self.width;
      over = from;
      slots.forEach((s, i) => {
        const mid = s.left + s.width / 2;
        if (i > from && mid < right) over++;
        else if (i < from && mid > left) over--;
      });
      setDrag({ id, from, over, dx, width: self.width });
    };

    const onPointerMove = (ev: PointerEvent) => {
      lastX = ev.clientX;
      update();
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || phase !== 'dragging') return;
      ev.preventDefault();
      ev.stopPropagation();
      phase = 'cancelled';
      setDrag(null);
    };
    const cleanup = () => {
      tab.removeEventListener('pointermove', onPointerMove);
      tab.removeEventListener('pointerup', onPointerUp);
      tab.removeEventListener('pointercancel', onPointerCancel);
      tab.removeEventListener('lostpointercapture', onPointerCancel);
      bar.removeEventListener('scroll', update);
      window.removeEventListener('keydown', onKeyDown, true);
      if (tab.hasPointerCapture(pointerId)) tab.releasePointerCapture(pointerId);
      abortRef.current = null;
    };
    const onPointerUp = () => {
      cleanup();
      if (phase === 'pending') return;
      window.addEventListener('click', swallowClick, true);
      setTimeout(() => window.removeEventListener('click', swallowClick, true), 0);
      setDrag(null);
      if (phase === 'dragging' && over !== from) onMove(id, over);
    };
    const onPointerCancel = () => {
      cleanup();
      setDrag(null);
    };

    tab.addEventListener('pointermove', onPointerMove);
    tab.addEventListener('pointerup', onPointerUp);
    tab.addEventListener('pointercancel', onPointerCancel);
    // Capture only ends before pointerup if the release went missing; don't leave the drag stuck.
    tab.addEventListener('lostpointercapture', onPointerCancel);
    bar.addEventListener('scroll', update);
    window.addEventListener('keydown', onKeyDown, true);
    abortRef.current = cleanup;
  }, [ids, onMove]);

  /** Transform for the tab at `index`: the dragged one follows the pointer, the ones it has passed make room. */
  const tabStyle = (index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    let x = 0;
    if (index === drag.from) x = drag.dx;
    else if (drag.from < index && index <= drag.over) x = -drag.width;
    else if (drag.over <= index && index < drag.from) x = drag.width;
    return x ? { transform: `translateX(${x}px)` } : undefined;
  };

  return { barRef, draggingId: drag?.id ?? null, startDrag, tabStyle };
}

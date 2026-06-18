import { useRef, useState, useCallback, useEffect } from 'react';

// Pan/zoom viewport for the flowchart editor. The world layer is positioned with
// `transform: translate(tx, ty) scale(scale)`; because nodes keep their layout
// coordinates (offsetLeft/Top), all edge geometry stays in unscaled world space.

export interface ViewportTransform {
  scale: number;
  tx: number;
  ty: number;
}

export interface ContentBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;
const FIT_PADDING = 64;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function useViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<ViewportTransform>({ scale: 1, tx: FIT_PADDING, ty: FIT_PADDING });
  const [isPanning, setIsPanning] = useState(false);

  // Keep the latest transform readable from event handlers without touching the
  // ref during render (which the lint rules forbid).
  const transformRef = useRef(transform);
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  /** Zoom by `factor` keeping the world point under (clientX, clientY) fixed. */
  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    setTransform((prev) => {
      const newScale = clamp(prev.scale * factor, MIN_SCALE, MAX_SCALE);
      const wx = (px - prev.tx) / prev.scale;
      const wy = (py - prev.ty) / prev.scale;
      return { scale: newScale, tx: px - wx * newScale, ty: py - wy * newScale };
    });
  }, []);

  const zoomIn = useCallback(() => {
    const c = containerRef.current;
    if (c) zoomAt(c.getBoundingClientRect().left + c.clientWidth / 2, c.getBoundingClientRect().top + c.clientHeight / 2, 1.2);
  }, [zoomAt]);

  const zoomOut = useCallback(() => {
    const c = containerRef.current;
    if (c) zoomAt(c.getBoundingClientRect().left + c.clientWidth / 2, c.getBoundingClientRect().top + c.clientHeight / 2, 1 / 1.2);
  }, [zoomAt]);

  /** Convert a screen (client) point to world coordinates. */
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const { scale, tx, ty } = transformRef.current;
    return { x: (clientX - rect.left - tx) / scale, y: (clientY - rect.top - ty) / scale };
  }, []);

  /** Begin a pan gesture from a pointer position (middle-drag or space-drag). */
  const beginPan = useCallback((clientX: number, clientY: number) => {
    const start = { x: clientX, y: clientY, tx: transformRef.current.tx, ty: transformRef.current.ty };
    setIsPanning(true);
    const onMove = (e: MouseEvent) => {
      setTransform((prev) => ({ ...prev, tx: start.tx + (e.clientX - start.x), ty: start.ty + (e.clientY - start.y) }));
    };
    const onUp = () => {
      setIsPanning(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  /** Fit the given content bounding box within the container. */
  const fit = useCallback((box: ContentBox) => {
    const container = containerRef.current;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const bw = box.maxX - box.minX;
    const bh = box.maxY - box.minY;
    if (bw <= 0 || bh <= 0) {
      setTransform({ scale: 1, tx: FIT_PADDING, ty: FIT_PADDING });
      return;
    }
    const scale = clamp(Math.min((cw - 2 * FIT_PADDING) / bw, (ch - 2 * FIT_PADDING) / bh), MIN_SCALE, 1.2);
    const tx = (cw - bw * scale) / 2 - box.minX * scale;
    const ty = (ch - bh * scale) / 2 - box.minY * scale;
    setTransform({ scale, tx, ty });
  }, []);

  const reset = useCallback(() => setTransform({ scale: 1, tx: FIT_PADDING, ty: FIT_PADDING }), []);

  const getScale = useCallback(() => transformRef.current.scale, []);

  // Wheel-to-zoom (non-passive so we can preventDefault the page scroll).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  return { containerRef, transform, isPanning, beginPan, screenToWorld, zoomIn, zoomOut, fit, reset, getScale };
}

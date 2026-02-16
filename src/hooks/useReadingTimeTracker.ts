import { useEffect, useRef, useCallback } from 'react';
import { readingTimeStorage, getCSTDateString } from '../services/readingTimeStorage';

const FLUSH_INTERVAL_MS = 30_000;
const IDLE_TIMEOUT_MS = 60_000;

export function useReadingTimeTracker(
  attachmentId: string | undefined,
  filename: string,
): void {
  const accumulatedSecondsRef = useRef(0);
  const lastTickRef = useRef<number>(0);
  const isActiveRef = useRef(true);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const currentDateCSTRef = useRef(getCSTDateString());

  const attachmentIdRef = useRef(attachmentId);
  const filenameRef = useRef(filename);
  attachmentIdRef.current = attachmentId;
  filenameRef.current = filename;

  const flush = useCallback(() => {
    const id = attachmentIdRef.current;
    const name = filenameRef.current;
    if (!id || accumulatedSecondsRef.current <= 0) return;

    const nowDateCST = getCSTDateString();
    const dateToCredit = currentDateCSTRef.current;
    readingTimeStorage.addSeconds(id, name, dateToCredit, accumulatedSecondsRef.current);
    accumulatedSecondsRef.current = 0;
    currentDateCSTRef.current = nowDateCST;
  }, []);

  useEffect(() => {
    if (!attachmentId) return;

    lastTickRef.current = Date.now();
    const tickInterval = setInterval(() => {
      if (!isActiveRef.current) return;
      const now = Date.now();
      const elapsed = (now - lastTickRef.current) / 1000;
      accumulatedSecondsRef.current += Math.min(elapsed, 2);
      lastTickRef.current = now;
    }, 1000);

    flushIntervalRef.current = setInterval(flush, FLUSH_INTERVAL_MS);

    const resetIdle = () => {
      if (!isActiveRef.current) {
        isActiveRef.current = true;
        lastTickRef.current = Date.now();
      }
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        flush();
        isActiveRef.current = false;
      }, IDLE_TIMEOUT_MS);
    };

    const activityEvents = ['mousemove', 'keydown', 'scroll', 'mousedown', 'touchstart'];
    activityEvents.forEach((evt) =>
      window.addEventListener(evt, resetIdle, { passive: true }),
    );

    const handleVisibility = () => {
      if (document.hidden) {
        flush();
        isActiveRef.current = false;
      } else {
        isActiveRef.current = true;
        lastTickRef.current = Date.now();
        resetIdle();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const handleBeforeUnload = () => flush();
    window.addEventListener('beforeunload', handleBeforeUnload);

    resetIdle();

    return () => {
      clearInterval(tickInterval);
      clearInterval(flushIntervalRef.current);
      clearTimeout(idleTimerRef.current);
      activityEvents.forEach((evt) => window.removeEventListener(evt, resetIdle));
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flush();
    };
  }, [attachmentId, flush]);
}

import { createContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { globalTimerStorage } from '../services/globalTimerStorage';
import { getCSTDateString } from '../services/readingTimeStorage';

const FLUSH_INTERVAL_MS = 10_000;

interface GlobalTimerState {
  totalSeconds: number;
  isRunning: boolean;
  toggle: () => void;
  reset: () => void;
  start: () => void;
  pause: () => void;
}

const GlobalTimerContext = createContext<GlobalTimerState | null>(null);

export { GlobalTimerContext };

export function GlobalTimerProvider({ children }: { children: ReactNode }) {
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const lastTickRef = useRef(0);
  const currentDateRef = useRef<string>('');
  const lastFlushedSecondsRef = useRef(0);
  const totalSecondsRef = useRef(0);

  // Load initial value from server
  useEffect(() => {
    const today = getCSTDateString();
    currentDateRef.current = today;
    globalTimerStorage.load(today).then((data) => {
      setTotalSeconds(data.totalSeconds);
      totalSecondsRef.current = data.totalSeconds;
      lastFlushedSecondsRef.current = data.totalSeconds;
    }).catch(() => {});
  }, []);

  const flush = useCallback(() => {
    const delta = totalSecondsRef.current - lastFlushedSecondsRef.current;
    if (delta <= 0 || !currentDateRef.current) return;
    lastFlushedSecondsRef.current = totalSecondsRef.current;
    globalTimerStorage.addSeconds(currentDateRef.current, delta).catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    setIsRunning((prev) => !prev);
  }, []);

  const start = useCallback(() => {
    setIsRunning(true);
  }, []);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    flush();
    if (currentDateRef.current) {
      globalTimerStorage.resetDate(currentDateRef.current).catch(() => {});
    }
    setTotalSeconds(0);
    totalSecondsRef.current = 0;
    lastFlushedSecondsRef.current = 0;
  }, [flush]);

  // Tick interval
  useEffect(() => {
    if (!isRunning) return;

    lastTickRef.current = Date.now();

    const tickInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.min((now - lastTickRef.current) / 1000, 2);
      lastTickRef.current = now;

      const today = getCSTDateString();
      if (today !== currentDateRef.current) {
        flush();
        currentDateRef.current = today;
        totalSecondsRef.current = 0;
        lastFlushedSecondsRef.current = 0;
        setTotalSeconds(0);
        return;
      }

      setTotalSeconds((prev) => {
        const next = prev + elapsed;
        totalSecondsRef.current = next;
        return next;
      });
    }, 1000);

    return () => clearInterval(tickInterval);
  }, [isRunning, flush]);

  // Flush interval + unload/visibility handlers
  useEffect(() => {
    const interval = setInterval(flush, FLUSH_INTERVAL_MS);

    const handleBeforeUnload = () => flush();
    window.addEventListener('beforeunload', handleBeforeUnload);

    const handleVisibility = () => {
      if (document.hidden) {
        flush();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
      flush();
    };
  }, [flush]);

  const value: GlobalTimerState = {
    totalSeconds: Math.floor(totalSeconds),
    isRunning,
    toggle,
    reset,
    start,
    pause,
  };

  return (
    <GlobalTimerContext value={value}>
      {children}
    </GlobalTimerContext>
  );
}


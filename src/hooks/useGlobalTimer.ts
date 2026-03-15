import { useState, useEffect, useRef, useCallback } from 'react';
import { globalTimerStorage } from '../services/globalTimerStorage';
import { getCSTDateString } from '../services/readingTimeStorage';

const FLUSH_INTERVAL_MS = 10_000;
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'scroll', 'mousedown', 'touchstart'];

interface GlobalTimerState {
  totalSeconds: number;
  isRunning: boolean;
  toggle: () => void;
}

export function useGlobalTimer(): GlobalTimerState {
  const [totalSeconds, setTotalSeconds] = useState(() => {
    const data = globalTimerStorage.load();
    return data.totalSeconds;
  });
  const [isRunning, setIsRunning] = useState(true);

  const totalSecondsRef = useRef(totalSeconds);
  const lastTickRef = useRef(0);
  const currentDateRef = useRef<string>('');

  // Sync totalSecondsRef in effects that update it, not during render
  useEffect(() => {
    currentDateRef.current = getCSTDateString();
  }, []);

  const flush = useCallback(() => {
    if (currentDateRef.current) {
      globalTimerStorage.save(currentDateRef.current, totalSecondsRef.current);
    }
  }, []);

  const toggle = useCallback(() => {
    setIsRunning((prev) => !prev);
  }, []);

  // Tick interval — restarts when isRunning changes
  useEffect(() => {
    if (!isRunning) return;

    lastTickRef.current = Date.now();

    const tickInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.min((now - lastTickRef.current) / 1000, 2);
      lastTickRef.current = now;

      // Check for date rollover
      const today = getCSTDateString();
      if (today !== currentDateRef.current) {
        currentDateRef.current = today;
        totalSecondsRef.current = 0;
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
  }, [isRunning]);

  // Flush interval + unload/visibility handlers
  useEffect(() => {
    const interval = setInterval(flush, FLUSH_INTERVAL_MS);

    const handleBeforeUnload = () => flush();
    window.addEventListener('beforeunload', handleBeforeUnload);

    const handleVisibility = () => {
      if (document.hidden) {
        flush();
      } else {
        lastTickRef.current = Date.now();
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

  // Auto-resume on activity when stopped
  useEffect(() => {
    if (isRunning) return;

    const handleActivity = () => {
      setIsRunning(true);
      lastTickRef.current = Date.now();
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true, once: true }),
    );

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
    };
  }, [isRunning]);

  return { totalSeconds: Math.floor(totalSeconds), isRunning, toggle };
}

import { useEffect, useState } from 'react';

/**
 * A "current time" value that is stable within a render and refreshes once a
 * minute, so derived labels like "3 days ago" stay accurate on a page left open
 * without calling Date.now() during render.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

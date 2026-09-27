import { useEffect, useRef, useState } from 'react';
import type { AttachmentMeta } from '../../types/attachment';
import { enrichAttachment, needsEnrichment } from '../../services/attachmentEnrichment';
import { attachmentStorage } from '../../services/attachmentStorage';
import { byLastOpenedDesc } from './libraryModel';

export interface EnrichmentProgress {
  /** Items still waiting (including the one in flight). */
  pending: number;
  /** Items this session set out to process. */
  total: number;
  active: boolean;
}

/**
 * Back-fills page count, metadata and thumbnails for items that have never
 * been parsed, one file at a time so the library stays responsive. Recently
 * opened items go first because they are the ones on screen.
 */
export function useLibraryEnrichment(
  books: AttachmentMeta[],
  onUpdated: (meta: AttachmentMeta) => void,
): EnrichmentProgress {
  const [progress, setProgress] = useState<EnrichmentProgress>({ pending: 0, total: 0, active: false });
  const runningRef = useRef(false);
  const cancelledRef = useRef(false);
  // Ids we already attempted this session (success or failure) — never retry in-session.
  const attemptedRef = useRef<Set<string>>(new Set());
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;
  const booksRef = useRef(books);
  booksRef.current = books;

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (runningRef.current) return;
    const nextQueue = () =>
      booksRef.current.filter(b => needsEnrichment(b) && !attemptedRef.current.has(b.id)).sort(byLastOpenedDesc);
    if (nextQueue().length === 0) return;

    runningRef.current = true;
    let done = 0;
    let total = 0;

    (async () => {
      // Loop until nothing is left, so items uploaded mid-run are picked up too.
      for (;;) {
        const queue = nextQueue();
        if (queue.length === 0 || cancelledRef.current) break;
        total = done + queue.length;
        setProgress({ pending: queue.length, total, active: true });
        for (const initial of queue) {
          if (cancelledRef.current) break;
          // Re-read the latest record: the viewer may have enriched it meanwhile.
          const current = booksRef.current.find(b => b.id === initial.id) ?? initial;
          attemptedRef.current.add(current.id);
          if (needsEnrichment(current)) {
            try {
              const updated = await enrichAttachment(current);
              if (!cancelledRef.current) onUpdatedRef.current(updated);
            } catch (err) {
              console.warn(`Enrichment failed for ${current.filename}:`, err);
              // Record the attempt so a broken file is not re-parsed every session.
              try {
                const marked = await attachmentStorage.enrich(current.id, {});
                if (!cancelledRef.current) onUpdatedRef.current(marked);
              } catch {
                /* server unreachable — leave it for next time */
              }
            }
          }
          done += 1;
          if (!cancelledRef.current) setProgress({ pending: total - done, total, active: true });
        }
      }
      runningRef.current = false;
      if (!cancelledRef.current) setProgress(p => ({ ...p, pending: 0, active: false }));
    })();
  }, [books]);

  return progress;
}

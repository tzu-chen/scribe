import { useState } from 'react';
import type { AttachmentMeta } from '../../types/attachment';
import { attachmentStorage } from '../../services/attachmentStorage';
import { displayTitle, getProgress } from '../../utils/libraryActivity';
import styles from './BookCover.module.css';

interface BookCoverProps {
  book: AttachmentMeta;
  /** sm ≈ 36px wide (table rows), md ≈ 120px (grid), lg ≈ 150px (shelves). */
  size?: 'sm' | 'md' | 'lg';
  showProgress?: boolean;
  className?: string;
}

/**
 * First-page thumbnail with a typographic fallback while (or if) none exists.
 * The fallback prints the title on a paper-coloured block so an un-enriched
 * item is still recognisable at a glance.
 */
export function BookCover({ book, size = 'md', showProgress = false, className }: BookCoverProps) {
  const [failed, setFailed] = useState(false);
  const url = failed ? null : attachmentStorage.thumbnailUrl(book);
  const progress = showProgress ? getProgress(book) : null;
  const title = displayTitle(book);

  return (
    <div className={`${styles.cover} ${styles[size]} ${className ?? ''}`} aria-hidden="true">
      {url ? (
        <img
          className={styles.img}
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className={styles.fallback}>
          {size !== 'sm' && <span className={styles.fallbackTitle}>{title}</span>}
        </div>
      )}
      {progress !== null && (
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

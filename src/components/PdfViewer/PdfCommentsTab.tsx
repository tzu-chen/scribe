import { useMemo } from 'react';
import { format } from 'date-fns';
import type { PdfHighlight, PdfComment } from '../../types/annotation';
import styles from './PdfRightPanel.module.css';

interface Props {
  highlights: PdfHighlight[];
  comments: Record<string, PdfComment[]>;
  onScrollToPage: (page: number) => void;
}

export function PdfCommentsTab({ highlights, comments, onScrollToPage }: Props) {
  const sortedHighlights = useMemo(
    () =>
      [...highlights].sort(
        (a, b) =>
          a.pageNumber - b.pageNumber ||
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [highlights],
  );

  if (sortedHighlights.length === 0) {
    return (
      <p className={styles.empty}>
        No highlights or comments yet. Select text in the PDF to add highlights.
      </p>
    );
  }

  return (
    <div>
      {sortedHighlights.map(hl => (
        <div
          key={hl.id}
          className={styles.highlightGroup}
          onClick={() => onScrollToPage(hl.pageNumber)}
        >
          <div className={styles.highlightHeader}>
            <span className={styles.pageLabel}>Page {hl.pageNumber}</span>
            <span
              className={styles.highlightColor}
              style={{ background: hl.color }}
            />
          </div>
          <p className={styles.selectedText}>
            &ldquo;{hl.selectedText.slice(0, 100)}
            {hl.selectedText.length > 100 ? '...' : ''}&rdquo;
          </p>
          {comments[hl.id] && comments[hl.id].length > 0 && (
            <ul className={styles.commentList}>
              {comments[hl.id].map(c => (
                <li key={c.id} className={styles.commentItem}>
                  <p className={styles.commentText}>{c.text}</p>
                  <time className={styles.commentDate}>
                    {format(new Date(c.createdAt), 'MMM d, yyyy')}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

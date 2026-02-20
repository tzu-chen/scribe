import React, { useEffect } from 'react';
import { useReadingSummary, type ViewMode } from '../../hooks/useReadingSummary';
import styles from './SummaryPage.module.css';

const ACTIVE_THRESHOLD = 1800; // 30 minutes in seconds

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return '0m';
}

export function SummaryPage() {
  const { viewMode, setViewMode, days, books, totalSeconds, refresh } =
    useReadingSummary();

  // Refresh data when the page becomes visible (returning from reading)
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refresh]);

  const handleViewChange = (mode: ViewMode) => setViewMode(mode);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Reading Summary</h1>
        <div className={styles.viewToggle}>
          <button
            className={`${styles.toggleBtn} ${viewMode === 'week' ? styles.toggleBtnActive : ''}`}
            onClick={() => handleViewChange('week')}
          >
            This Week
          </button>
          <button
            className={`${styles.toggleBtn} ${viewMode === 'month' ? styles.toggleBtnActive : ''}`}
            onClick={() => handleViewChange('month')}
          >
            This Month
          </button>
        </div>
      </div>

      <div className={styles.totalCard}>
        <span className={styles.totalLabel}>
          Total reading time ({viewMode === 'week' ? 'this week' : 'this month'})
        </span>
        <span className={styles.totalValue}>{formatDuration(totalSeconds)}</span>
      </div>

      {viewMode === 'week' ? (
        books.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No reading data yet</p>
            <p className={styles.emptyText}>
              Open a book from the Library to start tracking your reading time.
            </p>
          </div>
        ) : (
          <div className={styles.heatmapWrapper}>
            <div className={styles.heatmapScroll}>
              <div className={styles.heatmapGrid}>
                {/* Header row: empty corner + 7 day labels + Total */}
                <div className={styles.heatmapLabelCell} />
                {days.map((day) => (
                  <div key={day.dateCST} className={styles.heatmapDayHeader}>
                    {day.label}
                  </div>
                ))}
                <div className={styles.heatmapTotalHeader}>Total</div>

                {/* One row per book */}
                {books.map((book) => (
                  <React.Fragment key={book.attachmentId}>
                    <div className={styles.heatmapBookLabel}>
                      <span
                        className={styles.heatmapBookDot}
                        style={{ backgroundColor: book.color }}
                      />
                      <span className={styles.heatmapBookName}>{book.displayName}</span>
                    </div>
                    {days.map((day) => {
                      const seconds = day.books[book.attachmentId] ?? 0;
                      const isActive = seconds >= ACTIVE_THRESHOLD;
                      return (
                        <div
                          key={day.dateCST}
                          className={`${styles.heatmapCell} ${isActive ? styles.heatmapCellActive : styles.heatmapCellInactive}`}
                          style={isActive ? { backgroundColor: book.color } : undefined}
                          title={isActive ? `${book.displayName} · ${day.label}: ${formatDuration(seconds)}` : undefined}
                        />
                      );
                    })}
                    <div className={styles.heatmapRowTotal}>
                      {formatDuration(book.roundedSeconds)}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        )
      ) : (
        books.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No reading data yet</p>
            <p className={styles.emptyText}>
              Open a book from the Library to start tracking your reading time.
            </p>
          </div>
        ) : (
          <div className={styles.legend}>
            <h3 className={styles.legendTitle}>Books</h3>
            <ul className={styles.legendList}>
              {books.map((book) => (
                <li key={book.attachmentId} className={styles.legendItem}>
                  <span
                    className={styles.legendColor}
                    style={{ backgroundColor: book.color }}
                  />
                  <span className={styles.legendName}>{book.displayName}</span>
                  <span className={styles.legendTime}>
                    {formatDuration(book.roundedSeconds)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}

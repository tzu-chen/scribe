import { useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useReadingSummary, type ViewMode } from '../../hooks/useReadingSummary';
import styles from './SummaryPage.module.css';

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  if (totalSeconds > 0) return '<1m';
  return '0m';
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; color: string; name: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const nonZero = payload.filter((e) => e.value > 0);
  if (nonZero.length === 0) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      {nonZero.map((entry) => (
        <p key={entry.dataKey} className={styles.tooltipItem}>
          <span
            className={styles.tooltipColor}
            style={{ backgroundColor: entry.color }}
          />
          {entry.name}: {formatDuration(entry.value)}
        </p>
      ))}
    </div>
  );
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

  const chartData = days.map((day) => {
    const point: Record<string, string | number> = { label: day.label };
    for (const book of books) {
      point[book.attachmentId] = day.books[book.attachmentId] || 0;
    }
    return point;
  });

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

      {books.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No reading data yet</p>
          <p className={styles.emptyText}>
            Open a book from the Library to start tracking your reading time.
          </p>
        </div>
      ) : (
        <div className={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                tickLine={{ stroke: 'var(--color-border)' }}
                axisLine={{ stroke: 'var(--color-border)' }}
                interval={viewMode === 'month' ? Math.max(0, Math.floor(days.length / 10) - 1) : 0}
              />
              <YAxis
                tickFormatter={(value: number) => formatDuration(value)}
                tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                tickLine={{ stroke: 'var(--color-border)' }}
                axisLine={{ stroke: 'var(--color-border)' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value: string) => {
                  const book = books.find((b) => b.attachmentId === value);
                  return book?.filename ?? value;
                }}
                wrapperStyle={{ fontSize: '0.8125rem' }}
              />
              {books.map((book) => (
                <Bar
                  key={book.attachmentId}
                  dataKey={book.attachmentId}
                  name={book.attachmentId}
                  fill={book.color}
                  stackId="reading"
                  radius={[2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {books.length > 0 && (
        <div className={styles.legend}>
          <h3 className={styles.legendTitle}>Books</h3>
          <ul className={styles.legendList}>
            {books.map((book) => {
              const bookTotal = days.reduce(
                (sum, day) => sum + (day.books[book.attachmentId] || 0),
                0,
              );
              return (
                <li key={book.attachmentId} className={styles.legendItem}>
                  <span
                    className={styles.legendColor}
                    style={{ backgroundColor: book.color }}
                  />
                  <span className={styles.legendName}>{book.filename}</span>
                  <span className={styles.legendTime}>
                    {formatDuration(bookTotal)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

import { useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';
import { useReadingSummary, type ViewMode } from '../../hooks/useReadingSummary';
import styles from './SummaryPage.module.css';

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return '0m';
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { displayName: string; totalSeconds: number; color: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{data.displayName}</p>
      <p className={styles.tooltipItem}>
        <span
          className={styles.tooltipColor}
          style={{ backgroundColor: data.color }}
        />
        {formatDuration(data.totalSeconds)}
      </p>
    </div>
  );
}

function BarEndLabel(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, value = 0 } = props;
  return (
    <text
      x={x + width + 8}
      y={y + height / 2}
      dy={4}
      fill="var(--color-text-secondary)"
      fontSize={12}
      textAnchor="start"
    >
      {formatDuration(value)}
    </text>
  );
}

export function SummaryPage() {
  const { viewMode, setViewMode, books, totalSeconds, refresh } =
    useReadingSummary();

  // Refresh data when the page becomes visible (returning from reading)
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refresh]);

  const chartData = books.map((book) => ({
    displayName: book.displayName,
    totalSeconds: book.roundedSeconds,
    color: book.color,
    attachmentId: book.attachmentId,
  }));

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
          <ResponsiveContainer width="100%" height={Math.max(200, books.length * 50 + 40)}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 10, right: 80, left: 20, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border-light)"
                horizontal={false}
              />
              <XAxis
                type="number"
                tickFormatter={(value: number) => formatDuration(value)}
                tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
                tickLine={{ stroke: 'var(--color-border)' }}
                axisLine={{ stroke: 'var(--color-border)' }}
              />
              <YAxis
                type="category"
                dataKey="displayName"
                width={150}
                tick={{ fill: 'var(--color-text)', fontSize: 13 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-primary-light)' }} />
              <Bar dataKey="totalSeconds" radius={[0, 4, 4, 0]} barSize={30}>
                {chartData.map((entry) => (
                  <Cell key={entry.attachmentId} fill={entry.color} />
                ))}
                <LabelList
                  dataKey="totalSeconds"
                  content={<BarEndLabel />}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {books.length > 0 && (
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
      )}
    </div>
  );
}

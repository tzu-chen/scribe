import { useGlobalTimer } from '../../hooks/useGlobalTimer';
import styles from './GlobalTimer.module.css';

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return `${h}:${mm}:${ss}`;
}

export function GlobalTimer() {
  const { totalSeconds, isRunning, toggle, reset } = useGlobalTimer();

  return (
    <div className={styles.container}>
      <span
        className={styles.time}
        onClick={reset}
        title="Reset today's timer"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') reset(); }}
      >
        {formatTime(totalSeconds)}
      </span>
      <button
        className={styles.toggleButton}
        onClick={toggle}
        title={isRunning ? 'Pause timer' : 'Resume timer'}
        aria-label={isRunning ? 'Pause timer' : 'Resume timer'}
      >
        {isRunning ? '⏸' : '▶'}
      </button>
    </div>
  );
}

import type { AttachmentKind } from '../../types/attachment';
import { KIND_LABELS } from '../../types/attachment';
import type { Activity } from '../../utils/libraryActivity';
import { ACTIVITY_LABELS, ACTIVITY_ORDER } from '../../utils/libraryActivity';
import type { KindFilter, LibraryFilters, SortDir, SortField } from './libraryModel';
import { KIND_ORDER } from './libraryModel';
import styles from './LibraryPage.module.css';

interface Props {
  filters: LibraryFilters;
  onChange: (next: LibraryFilters) => void;
  kindCounts: Map<KindFilter, number>;
  activityCounts: Map<Activity, number>;
  total: number;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField, dir: SortDir) => void;
  /** The table has its own sortable headers; only the grid needs the select. */
  showSort: boolean;
}

const SORT_OPTIONS: Array<{ value: `${SortField}:${SortDir}`; label: string }> = [
  { value: 'lastOpened:desc', label: 'Recently opened' },
  { value: 'uploaded:desc', label: 'Recently added' },
  { value: 'name:asc', label: 'Title A–Z' },
  { value: 'kind:asc', label: 'Kind' },
  { value: 'progress:desc', label: 'Most progress' },
];

export function LibraryFilterBar({
  filters,
  onChange,
  kindCounts,
  activityCounts,
  total,
  sortField,
  sortDir,
  onSort,
  showSort,
}: Props) {
  const kindChip = (value: KindFilter, label: string) => {
    const count = value === null ? total : (kindCounts.get(value) ?? 0);
    if (value !== null && count === 0 && filters.kind !== value) return null;
    const active = filters.kind === value;
    return (
      <button
        key={value ?? 'all'}
        type="button"
        className={`${styles.chip} ${active ? styles.chipActive : ''}`}
        onClick={() => onChange({ ...filters, kind: active && value !== null ? null : value })}
        aria-pressed={active}
      >
        {label}
        <span className={styles.chipCount}>{count}</span>
      </button>
    );
  };

  const activityChip = (value: Activity) => {
    const count = activityCounts.get(value) ?? 0;
    if (count === 0 && filters.activity !== value) return null;
    const active = filters.activity === value;
    return (
      <button
        key={value}
        type="button"
        className={`${styles.chip} ${styles.chipQuiet} ${active ? styles.chipActive : ''}`}
        onClick={() => onChange({ ...filters, activity: active ? null : value })}
        aria-pressed={active}
      >
        {ACTIVITY_LABELS[value]}
        <span className={styles.chipCount}>{count}</span>
      </button>
    );
  };

  return (
    <div className={styles.filterBar}>
      <div className={styles.chipRow} role="group" aria-label="Kind">
        {kindChip(null, 'All')}
        {KIND_ORDER.map((k: AttachmentKind) => kindChip(k, KIND_LABELS[k].plural))}
        {kindChip('unsorted', 'Unsorted')}
      </div>
      <div className={styles.chipRow} role="group" aria-label="Activity">
        {ACTIVITY_ORDER.map(activityChip)}
        {showSort && (
          <select
            className={styles.sortSelect}
            value={`${sortField}:${sortDir}`}
            onChange={e => {
              const [f, d] = e.target.value.split(':') as [SortField, SortDir];
              onSort(f, d);
            }}
            aria-label="Sort"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

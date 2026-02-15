import type { OutlineItem } from '../../hooks/usePdfDocument';
import styles from './PdfSidebar.module.css';

interface Props {
  outline: OutlineItem[];
  onNavigate: (page: number, destTop: number | null) => void;
}

function OutlineTree({ items, depth, onNavigate }: { items: OutlineItem[]; depth: number; onNavigate: (page: number, destTop: number | null) => void }) {
  return (
    <ul className={styles.list} style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
      {items.map((item, i) => (
        <li key={`${item.pageNumber}-${i}`}>
          <button
            className={styles.item}
            onClick={() => onNavigate(item.pageNumber, item.destTop)}
            title={`Go to page ${item.pageNumber}`}
          >
            <span className={styles.itemTitle}>{item.title}</span>
            <span className={styles.itemPage}>{item.pageNumber}</span>
          </button>
          {item.children.length > 0 && (
            <OutlineTree items={item.children} depth={depth + 1} onNavigate={onNavigate} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function PdfSidebar({ outline, onNavigate }: Props) {
  if (outline.length === 0) {
    return (
      <div className={styles.sidebar}>
        <div className={styles.header}>
          <h3 className={styles.title}>Table of Contents</h3>
        </div>
        <p className={styles.empty}>No table of contents available.</p>
      </div>
    );
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <h3 className={styles.title}>Table of Contents</h3>
      </div>
      <div className={styles.content}>
        <OutlineTree items={outline} depth={0} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

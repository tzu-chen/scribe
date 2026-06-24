import type { PdfHighlight } from '../../types/annotation';
import styles from './PdfHighlightLayer.module.css';

interface Props {
  highlights: PdfHighlight[];
  pageWidth: number;
  pageHeight: number;
  onHighlightClick: (highlightId: string, anchorRect: DOMRect) => void;
}

export function PdfHighlightLayer({ highlights, pageWidth, pageHeight, onHighlightClick }: Props) {
  return (
    <div className={styles.layer}>
      {highlights.map(hl => (
        // One group per highlight: rects are painted opaque inside, while
        // transparency + blend are applied once to the group. Overlapping
        // OCR selection rects therefore stay flat (idempotent) instead of
        // compounding into darker blotches.
        <div key={hl.id} className={styles.group} style={{ color: hl.color || '#ffec99' }}>
          {hl.rects.map((rect, i) => (
            <div
              key={i}
              className={styles.highlight}
              style={{
                left: rect.x * pageWidth,
                top: rect.y * pageHeight,
                width: rect.width * pageWidth,
                height: rect.height * pageHeight,
              }}
              onClick={e => {
                e.stopPropagation();
                onHighlightClick(hl.id, (e.target as HTMLElement).getBoundingClientRect());
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

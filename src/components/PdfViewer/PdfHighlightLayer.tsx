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
      {highlights.map(hl =>
        hl.rects.map((rect, i) => (
          <div
            key={`${hl.id}-${i}`}
            className={styles.highlight}
            style={{
              left: rect.x * pageWidth,
              top: rect.y * pageHeight,
              width: rect.width * pageWidth,
              height: rect.height * pageHeight,
              backgroundColor: hl.color || '#ffec99',
            }}
            onClick={e => {
              e.stopPropagation();
              onHighlightClick(hl.id, (e.target as HTMLElement).getBoundingClientRect());
            }}
          />
        )),
      )}
    </div>
  );
}

import styles from './PdfSelectionToolbar.module.css';

interface Props {
  position: { x: number; y: number };
  onHighlight: () => void;
  onHighlightAndComment: () => void;
}

export function PdfSelectionToolbar({ position, onHighlight, onHighlightAndComment }: Props) {
  return (
    <div
      className={styles.toolbar}
      style={{ left: position.x, top: position.y }}
    >
      <button className={styles.button} onClick={onHighlight} title="Highlight selection">
        Highlight
      </button>
      <button className={styles.button} onClick={onHighlightAndComment} title="Highlight and add comment">
        Comment
      </button>
    </div>
  );
}

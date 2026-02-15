import { useState, useRef, useEffect } from 'react';
import type { PdfHighlight, PdfComment } from '../../types/annotation';
import styles from './PdfCommentPopover.module.css';

interface Props {
  highlight: PdfHighlight;
  comments: PdfComment[];
  anchorRect: DOMRect;
  onAddComment: (highlightId: string, text: string) => void;
  onUpdateComment: (id: string, highlightId: string, text: string) => void;
  onDeleteComment: (id: string, highlightId: string) => void;
  onDeleteHighlight: (id: string) => void;
  onClose: () => void;
}

export function PdfCommentPopover({
  highlight,
  comments,
  anchorRect,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onDeleteHighlight,
  onClose,
}: Props) {
  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleAdd = () => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    onAddComment(highlight.id, trimmed);
    setNewText('');
  };

  const handleStartEdit = (comment: PdfComment) => {
    setEditingId(comment.id);
    setEditText(comment.text);
  };

  const handleSaveEdit = (commentId: string) => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    onUpdateComment(commentId, highlight.id, trimmed);
    setEditingId(null);
    setEditText('');
  };

  const top = anchorRect.bottom + 8;
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 340));

  return (
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{ top, left }}
    >
      <div className={styles.header}>
        <span className={styles.selectedText} title={highlight.selectedText}>
          &ldquo;{highlight.selectedText.slice(0, 80)}
          {highlight.selectedText.length > 80 ? '...' : ''}&rdquo;
        </span>
        <button className={styles.closeBtn} onClick={onClose}>&times;</button>
      </div>

      {comments.length > 0 && (
        <ul className={styles.commentList}>
          {comments.map(c => (
            <li key={c.id} className={styles.commentItem}>
              {editingId === c.id ? (
                <div className={styles.editRow}>
                  <textarea
                    className={styles.editInput}
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    rows={2}
                  />
                  <div className={styles.editActions}>
                    <button className={styles.saveBtn} onClick={() => handleSaveEdit(c.id)}>
                      Save
                    </button>
                    <button className={styles.cancelBtn} onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.commentRow}>
                  <p className={styles.commentText}>{c.text}</p>
                  <div className={styles.commentActions}>
                    <button
                      className={styles.actionBtn}
                      onClick={() => handleStartEdit(c)}
                      title="Edit"
                    >
                      Edit
                    </button>
                    <button
                      className={styles.actionBtn}
                      onClick={() => onDeleteComment(c.id, highlight.id)}
                      title="Delete"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.addRow}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={newText}
          onChange={e => setNewText(e.target.value)}
          placeholder="Add a comment..."
          rows={2}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <button className={styles.addBtn} onClick={handleAdd} disabled={!newText.trim()}>
          Add
        </button>
      </div>

      <div className={styles.footer}>
        <button
          className={styles.deleteHighlightBtn}
          onClick={() => onDeleteHighlight(highlight.id)}
        >
          Remove highlight
        </button>
      </div>
    </div>
  );
}

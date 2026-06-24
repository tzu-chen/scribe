import { useState, useRef, useEffect } from 'react';
import type { PdfHighlight, PdfComment } from '../../types/annotation';
import { EditIcon, TrashIcon } from '../Icons/Icons';
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
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
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
    if (trimmed) onUpdateComment(commentId, highlight.id, trimmed);
    setEditingId(null);
    setEditText('');
  };

  const top = anchorRect.bottom + 8;
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - 280));

  return (
    <div ref={popoverRef} className={styles.popover} style={{ top, left }}>
      {comments.map(c =>
        editingId === c.id ? (
          <textarea
            key={c.id}
            className={styles.edit}
            value={editText}
            autoFocus
            rows={2}
            onChange={e => setEditText(e.target.value)}
            onBlur={() => handleSaveEdit(c.id)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSaveEdit(c.id);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEditingId(null);
              }
            }}
          />
        ) : (
          <div key={c.id} className={styles.comment}>
            <p className={styles.text}>{c.text}</p>
            <div className={styles.actions}>
              <button className={styles.iconBtn} title="Edit" onClick={() => handleStartEdit(c)}>
                <EditIcon size={13} />
              </button>
              <button
                className={styles.iconBtn}
                title="Delete comment"
                onClick={() => onDeleteComment(c.id, highlight.id)}
              >
                <TrashIcon size={13} />
              </button>
            </div>
          </div>
        ),
      )}

      {comments.length === 0 && (
        <div className={styles.composer}>
          <textarea
            ref={inputRef}
            className={styles.add}
            value={newText}
            placeholder="Add a comment…"
            rows={2}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAdd();
              }
            }}
          />
          <button
            className={styles.iconBtn}
            title="Remove highlight"
            onClick={() => onDeleteHighlight(highlight.id)}
          >
            <TrashIcon size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

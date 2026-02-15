import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import type { Note } from '../../types/note';
import styles from './NoteCard.module.css';

interface NoteCardProps {
  note: Note;
}

function getPreview(content: string, maxLength = 120): string {
  // Strip markdown syntax for a clean preview
  const plain = content
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/`[^`]+`/g, '')        // inline code
    .replace(/#{1,6}\s/g, '')       // headings
    .replace(/[*_~]{1,3}/g, '')     // bold/italic/strikethrough
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')    // images
    .replace(/\n+/g, ' ')
    .trim();
  return plain.length > maxLength ? plain.slice(0, maxLength) + '...' : plain;
}

export function NoteCard({ note }: NoteCardProps) {
  const navigate = useNavigate();

  return (
    <article
      className={styles.card}
      onClick={() => navigate(`/note/${note.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter') navigate(`/note/${note.id}`);
      }}
    >
      <div className={styles.header}>
        <h3 className={styles.title}>{note.title || 'Untitled'}</h3>
        <span className={`${styles.status} ${note.status === 'published' ? styles.published : styles.draft}`}>
          {note.status}
        </span>
      </div>
      {note.content && (
        <p className={styles.preview}>{getPreview(note.content)}</p>
      )}
      {(note.category || note.subject) && (
        <div className={styles.cardMeta}>
          {note.category && <span className={styles.category}>{note.category}</span>}
          {note.subject && <span className={styles.subject}>{note.subject}</span>}
        </div>
      )}
      <div className={styles.footer}>
        <div className={styles.tags}>
          {note.tags.slice(0, 4).map(tag => (
            <span key={tag} className={styles.tag}>{tag}</span>
          ))}
          {note.tags.length > 4 && (
            <span className={styles.tag}>+{note.tags.length - 4}</span>
          )}
        </div>
        <time className={styles.date}>
          {format(new Date(note.updatedAt), 'MMM d, yyyy')}
        </time>
      </div>
    </article>
  );
}

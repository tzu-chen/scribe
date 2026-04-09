import { useParams, useNavigate, Link } from 'react-router-dom';
import { format } from 'date-fns';
import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { useNotes } from '../../hooks/useNotes';
import { useTheme } from '../../contexts/ThemeContext';
import { ArrowLeftIcon } from '../../components/Icons/Icons';
import styles from './ViewPage.module.css';

export function ViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notes, deleteNote, loading } = useNotes();
  const { scheme } = useTheme();
  const note = notes.find(n => n.id === id);

  if (loading) {
    return <div className={styles.notFound}><p>Loading...</p></div>;
  }

  if (!note) {
    return (
      <div className={styles.notFound}>
        <p>Note not found.</p>
        <Link to="/notes">Back to Notes</Link>
      </div>
    );
  }

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      await deleteNote(note.id);
      navigate('/notes');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.actions}>
        <Link to="/notes" className={styles.backLink}>
          <ArrowLeftIcon size={14} /> Notes
        </Link>
        <div className={styles.actionButtons}>
          <Link to={`/note/${note.id}/edit`} className={styles.editButton}>
            Edit
          </Link>
          <button className={styles.deleteButton} onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      <article className={styles.article}>
        <header className={styles.header}>
          <h1 className={styles.title}>{note.title || 'Untitled'}</h1>
          <div className={styles.meta}>
            <span className={`${styles.status} ${note.status === 'published' ? styles.published : styles.draft}`}>
              {note.status}
            </span>
            <time className={styles.date}>
              Updated {format(new Date(note.updatedAt), 'MMMM d, yyyy')}
            </time>
          </div>
          {(note.category || note.subject) && (
            <div className={styles.noteMeta}>
              {note.category && (
                <span className={styles.category}>{note.category}</span>
              )}
              {note.subject && (
                <span className={styles.subject}>{note.subject}</span>
              )}
            </div>
          )}
          {note.tags.length > 0 && (
            <div className={styles.tags}>
              {note.tags.map(tag => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        <div className={styles.content} data-color-mode={scheme.type === 'dark' ? 'dark' : 'light'}>
          <MDEditor.Markdown
            source={note.content}
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
          />
        </div>
      </article>
    </div>
  );
}

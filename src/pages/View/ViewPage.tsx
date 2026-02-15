import { useParams, useNavigate, Link } from 'react-router-dom';
import { format } from 'date-fns';
import MDEditor from '@uiw/react-md-editor';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useNotes } from '../../hooks/useNotes';
import styles from './ViewPage.module.css';

const previewOptions = {
  components: {
    code: ({ children, className, ...props }: React.ComponentProps<'code'> & { 'data-code'?: string }) => {
      const codeString = props['data-code'] || (typeof children === 'string' ? children : '');

      if (typeof className === 'string' && /^language-katex/i.test(className)) {
        const html = katex.renderToString(codeString, { throwOnError: false, displayMode: true });
        return <code dangerouslySetInnerHTML={{ __html: html }} style={{ whiteSpace: 'normal' }} />;
      }

      const text = typeof children === 'string' ? children : '';
      if (/^\$\$([\s\S]+)\$\$$/m.test(text)) {
        const expression = text.slice(2, -2);
        const html = katex.renderToString(expression, { throwOnError: false });
        return <code dangerouslySetInnerHTML={{ __html: html }} style={{ background: 'none', padding: 0 }} />;
      }

      return <code className={className}>{children}</code>;
    },
  },
};

export function ViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notes, deleteNote } = useNotes();
  const note = notes.find(n => n.id === id);

  if (!note) {
    return (
      <div className={styles.notFound}>
        <p>Note not found.</p>
        <Link to="/">Back to Library</Link>
      </div>
    );
  }

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      deleteNote(note.id);
      navigate('/');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.actions}>
        <Link to="/" className={styles.backLink}>
          &larr; Library
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

        <div className={styles.content} data-color-mode="light">
          <MDEditor.Markdown source={note.content} components={previewOptions.components} />
        </div>
      </article>
    </div>
  );
}

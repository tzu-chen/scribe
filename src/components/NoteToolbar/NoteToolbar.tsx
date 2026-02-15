import type { SaveStatus } from '../../hooks/useAutoSave';
import type { NoteStatus } from '../../types/note';
import styles from './NoteToolbar.module.css';

interface NoteToolbarProps {
  status: NoteStatus;
  saveStatus: SaveStatus;
  onSaveDraft: () => void;
  onPublish: () => void;
  onDelete?: () => void;
  isExisting: boolean;
}

export function NoteToolbar({
  status,
  saveStatus,
  onSaveDraft,
  onPublish,
  onDelete,
  isExisting,
}: NoteToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.left}>
        <span className={styles.saveStatus}>
          {saveStatus === 'saving' && 'Saving...'}
          {saveStatus === 'saved' && 'Saved'}
        </span>
        <span className={`${styles.statusBadge} ${status === 'published' ? styles.published : styles.draft}`}>
          {status === 'published' ? 'Published' : 'Draft'}
        </span>
      </div>
      <div className={styles.right}>
        {isExisting && onDelete && (
          <button className={styles.deleteButton} onClick={onDelete}>
            Delete
          </button>
        )}
        <button className={styles.draftButton} onClick={onSaveDraft}>
          Save Draft
        </button>
        <button className={styles.publishButton} onClick={onPublish}>
          {status === 'published' ? 'Update' : 'Publish'}
        </button>
      </div>
    </div>
  );
}

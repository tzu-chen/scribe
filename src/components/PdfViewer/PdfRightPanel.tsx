import { useState } from 'react';
import type { PdfHighlight, PdfComment } from '../../types/annotation';
import type { Note } from '../../types/note';
import { PdfCommentsTab } from './PdfCommentsTab';
import { PdfNotesTab } from './PdfNotesTab';
import styles from './PdfRightPanel.module.css';

type RightPanelTab = 'comments' | 'notes';

interface Props {
  highlights: PdfHighlight[];
  comments: Record<string, PdfComment[]>;
  notes: Note[];
  subject: string;
  onScrollToPage: (page: number) => void;
  onNavigateToNote: (noteId: string) => void;
}

export function PdfRightPanel({
  highlights,
  comments,
  notes,
  subject,
  onScrollToPage,
  onNavigateToNote,
}: Props) {
  const [activeTab, setActiveTab] = useState<RightPanelTab>('comments');

  return (
    <div className={styles.panel}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'comments' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('comments')}
        >
          Comments
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'notes' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          Notes
        </button>
      </div>
      <div className={styles.content}>
        {activeTab === 'comments' && (
          <PdfCommentsTab
            highlights={highlights}
            comments={comments}
            onScrollToPage={onScrollToPage}
          />
        )}
        {activeTab === 'notes' && (
          <PdfNotesTab
            notes={notes}
            subject={subject}
            onNavigateToNote={onNavigateToNote}
          />
        )}
      </div>
    </div>
  );
}

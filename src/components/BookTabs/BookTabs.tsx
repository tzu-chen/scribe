import { useNavigate } from 'react-router-dom';
import { CloseIcon } from '../Icons/Icons';
import { useOpenBooks } from '../../contexts/OpenBooksContext';
import styles from './BookTabs.module.css';

interface BookTabsProps {
  activeId: string | undefined;
}

export function BookTabs({ activeId }: BookTabsProps) {
  const { tabs, closeBook } = useOpenBooks();
  const navigate = useNavigate();

  if (tabs.length <= 1) return null;

  const handleSelect = (id: string) => {
    if (id === activeId) return;
    navigate(`/pdf/${id}`);
  };

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const remaining = closeBook(id);
    if (id !== activeId) return;
    if (remaining.length === 0) {
      navigate('/');
      return;
    }
    const closedIndex = tabs.findIndex(t => t.id === id);
    const nextTab = remaining[Math.min(closedIndex, remaining.length - 1)];
    navigate(`/pdf/${nextTab.id}`);
  };

  return (
    <div className={styles.tabBar} role="tablist">
      {tabs.map(tab => {
        const isActive = tab.id === activeId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
            onClick={() => handleSelect(tab.id)}
            onAuxClick={(e) => {
              if (e.button === 1) handleClose(e, tab.id);
            }}
            title={tab.filename}
          >
            <span className={styles.tabLabel}>{tab.filename}</span>
            <button
              className={styles.closeButton}
              onClick={(e) => handleClose(e, tab.id)}
              aria-label={`Close ${tab.filename}`}
              title="Close tab"
            >
              <CloseIcon size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

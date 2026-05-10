import { useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SettingsMenu } from '../SettingsMenu/SettingsMenu';
import { useOpenBooks } from '../../contexts/OpenBooksContext';
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut';
import {
  LibraryIcon,
  NotesIcon,
  ReadIcon,
  FlowchartIcon,
  QuestionIcon,
  ClockIcon,
} from '../Icons/Icons';
import styles from './Layout.module.css';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { tabs, lastActiveId } = useOpenBooks();

  const goToLibrary = useCallback(() => navigate('/'), [navigate]);
  useKeyboardShortcut('goToLibrary', goToLibrary);

  const isHome = location.pathname === '/';
  const isNotes = location.pathname === '/notes';
  const isFlowcharts = location.pathname === '/flowcharts';
  const isQuestions = location.pathname === '/questions';
  const isSummary = location.pathname === '/summary';
  const isPdfViewer = location.pathname.startsWith('/pdf/');
  const readTargetId = lastActiveId && tabs.some(t => t.id === lastActiveId)
    ? lastActiveId
    : tabs[tabs.length - 1]?.id ?? null;
  const readDisabled = !readTargetId;
  const isFlowchartView = isFlowcharts && new URLSearchParams(location.search).has('view');
  const useFullWidth = isPdfViewer || isFlowchartView;

  const iconSize = 18;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <nav className={styles.nav}>
            <Link
              to="/"
              className={`${styles.navLink} ${isHome ? styles.navLinkActive : ''}`}
              aria-label="Library"
              title="Library"
            >
              <LibraryIcon size={iconSize} />
            </Link>
            <Link
              to="/notes"
              className={`${styles.navLink} ${isNotes ? styles.navLinkActive : ''}`}
              aria-label="Notes"
              title="Notes"
            >
              <NotesIcon size={iconSize} />
            </Link>
            {readDisabled ? (
              <span
                className={`${styles.navLink} ${styles.navLinkDisabled}`}
                aria-disabled="true"
                aria-label="Read"
                title="Open a book from the Library to enable Read"
              >
                <ReadIcon size={iconSize} />
              </span>
            ) : (
              <Link
                to={`/pdf/${readTargetId}`}
                className={`${styles.navLink} ${isPdfViewer ? styles.navLinkActive : ''}`}
                aria-label="Read"
                title="Read"
              >
                <ReadIcon size={iconSize} />
              </Link>
            )}
            <Link
              to="/flowcharts"
              className={`${styles.navLink} ${isFlowcharts ? styles.navLinkActive : ''}`}
              aria-label="Flowcharts"
              title="Flowcharts"
            >
              <FlowchartIcon size={iconSize} />
            </Link>
            <Link
              to="/questions"
              className={`${styles.navLink} ${isQuestions ? styles.navLinkActive : ''}`}
              aria-label="Questions"
              title="Questions"
            >
              <QuestionIcon size={iconSize} />
            </Link>
            <Link
              to="/summary"
              className={`${styles.navLink} ${isSummary ? styles.navLinkActive : ''}`}
              aria-label="Time"
              title="Time"
            >
              <ClockIcon size={iconSize} />
            </Link>
            <div className={styles.navSpacer} />
            <SettingsMenu />
          </nav>
        </div>
      </header>
      <main className={useFullWidth ? styles.mainFullWidth : styles.main}>{children}</main>
    </div>
  );
}

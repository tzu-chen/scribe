import { useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SettingsMenu } from '../SettingsMenu/SettingsMenu';
import { useOpenBooks } from '../../contexts/OpenBooksContext';
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut';
import scribeLogo from '../../scribe.svg';
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

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.logo}>
            <img src={scribeLogo} alt="Scribe" className={styles.logoIcon} />
          </Link>
          <nav className={styles.nav}>
            <Link
              to="/"
              className={`${styles.navLink} ${isHome ? styles.navLinkActive : ''}`}
            >
              Library
            </Link>
            <Link
              to="/notes"
              className={`${styles.navLink} ${isNotes ? styles.navLinkActive : ''}`}
            >
              Notes
            </Link>
            {readDisabled ? (
              <span
                className={`${styles.navLink} ${styles.navLinkDisabled}`}
                aria-disabled="true"
                title="Open a book from the Library to enable Read"
              >
                Read
              </span>
            ) : (
              <Link
                to={`/pdf/${readTargetId}`}
                className={`${styles.navLink} ${isPdfViewer ? styles.navLinkActive : ''}`}
              >
                Read
              </Link>
            )}
            <Link
              to="/flowcharts"
              className={`${styles.navLink} ${isFlowcharts ? styles.navLinkActive : ''}`}
            >
              Flowcharts
            </Link>
            <Link
              to="/questions"
              className={`${styles.navLink} ${isQuestions ? styles.navLinkActive : ''}`}
            >
              Questions
            </Link>
            <Link
              to="/summary"
              className={`${styles.navLink} ${isSummary ? styles.navLinkActive : ''}`}
            >
              Time
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

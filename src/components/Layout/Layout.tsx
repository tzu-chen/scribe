import { Link, useLocation } from 'react-router-dom';
import { ThemeMenu } from '../ThemeMenu/ThemeMenu';
import styles from './Layout.module.css';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const isNotes = location.pathname === '/notes';
  const isFlowcharts = location.pathname === '/flowcharts';
  const isSummary = location.pathname === '/summary';
  const isPdfViewer = location.pathname.startsWith('/pdf/');

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.logo}>
            Scribe
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
            <Link
              to="/flowcharts"
              className={`${styles.navLink} ${isFlowcharts ? styles.navLinkActive : ''}`}
            >
              Flowcharts
            </Link>
            <Link
              to="/summary"
              className={`${styles.navLink} ${isSummary ? styles.navLinkActive : ''}`}
            >
              Summary
            </Link>
            <ThemeMenu />
          </nav>
        </div>
      </header>
      <main className={isPdfViewer ? styles.mainFullWidth : styles.main}>{children}</main>
    </div>
  );
}

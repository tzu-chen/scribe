import { Link, useLocation } from 'react-router-dom';
import styles from './Layout.module.css';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const isFlowcharts = location.pathname === '/flowcharts';

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.logo}>
            Scribe
          </Link>
          <nav className={styles.nav}>
            {!isHome && (
              <Link to="/" className={styles.navLink}>
                Library
              </Link>
            )}
            {!isFlowcharts && (
              <Link to="/flowcharts" className={styles.navLink}>
                Flowcharts
              </Link>
            )}
            <Link to="/note/new" className={styles.newButton}>
              + New Note
            </Link>
          </nav>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeName } from '../../services/themeStorage';
import styles from './ThemeMenu.module.css';

interface ThemeOption {
  key: ThemeName;
  label: string;
  swatches: [string, string, string];
}

const THEMES: ThemeOption[] = [
  { key: 'default', label: 'Light', swatches: ['#f8f9fa', '#4263eb', '#212529'] },
  { key: 'dark', label: 'Dark', swatches: ['#1a1b1e', '#5c7cfa', '#e9ecef'] },
  { key: 'warm', label: 'Warm Earth', swatches: ['#faf6f1', '#c07434', '#3d2e1e'] },
  { key: 'ocean', label: 'Ocean', swatches: ['#f0f4f8', '#0077b6', '#1a3a4a'] },
  { key: 'high-contrast', label: 'High Contrast', swatches: ['#ffffff', '#0000cc', '#000000'] },
];

export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  return (
    <div className={styles.container} ref={menuRef}>
      <button
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Theme settings"
        aria-expanded={isOpen}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>Theme</div>
          {THEMES.map(opt => (
            <button
              key={opt.key}
              className={`${styles.option} ${theme === opt.key ? styles.active : ''}`}
              onClick={() => {
                setTheme(opt.key);
                setIsOpen(false);
              }}
            >
              <div className={styles.swatches}>
                {opt.swatches.map((color, i) => (
                  <span
                    key={i}
                    className={styles.swatch}
                    style={{ background: color }}
                  />
                ))}
              </div>
              <span className={styles.optionLabel}>{opt.label}</span>
              {theme === opt.key && (
                <svg
                  className={styles.check}
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

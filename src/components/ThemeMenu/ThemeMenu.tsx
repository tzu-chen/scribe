import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeName } from '../../services/themeStorage';
import styles from './ThemeMenu.module.css';

interface ThemeColors {
  bg: string;
  surface: string;
  primary: string;
  text: string;
  textSecondary: string;
  border: string;
  tagBg: string;
  tagText: string;
  primaryLight: string;
}

interface ThemeOption {
  key: ThemeName;
  label: string;
  colors: ThemeColors;
}

// Colors must match the CSS variables in global.css
const THEMES: ThemeOption[] = [
  {
    key: 'default',
    label: 'Light',
    colors: {
      bg: '#f8f9fa', surface: '#ffffff', primary: '#4263eb',
      text: '#212529', textSecondary: '#6c757d', border: '#dee2e6',
      tagBg: '#e9ecef', tagText: '#495057', primaryLight: '#edf2ff',
    },
  },
  {
    key: 'dark',
    label: 'Dark',
    colors: {
      bg: '#1a1b1e', surface: '#25262b', primary: '#5c7cfa',
      text: '#e9ecef', textSecondary: '#909296', border: '#373a40',
      tagBg: '#373a40', tagText: '#ced4da', primaryLight: '#2b2d42',
    },
  },
  {
    key: 'warm',
    label: 'Warm Earth',
    colors: {
      bg: '#faf6f1', surface: '#ffffff', primary: '#c07434',
      text: '#3d2e1e', textSecondary: '#8a7560', border: '#e0d5c7',
      tagBg: '#ede5d8', tagText: '#5c4a38', primaryLight: '#fdf0e2',
    },
  },
  {
    key: 'ocean',
    label: 'Ocean',
    colors: {
      bg: '#f0f4f8', surface: '#ffffff', primary: '#0077b6',
      text: '#1a3a4a', textSecondary: '#5a7d8f', border: '#c3d5e0',
      tagBg: '#dae6ed', tagText: '#3a5f70', primaryLight: '#e0f2fe',
    },
  },
  {
    key: 'high-contrast',
    label: 'High Contrast',
    colors: {
      bg: '#ffffff', surface: '#ffffff', primary: '#0000cc',
      text: '#000000', textSecondary: '#333333', border: '#000000',
      tagBg: '#e6e6e6', tagText: '#000000', primaryLight: '#e6e6ff',
    },
  },
  {
    key: 'rose',
    label: 'Rose',
    colors: {
      bg: '#fdf2f4', surface: '#ffffff', primary: '#d63865',
      text: '#3d1f27', textSecondary: '#8f5a66', border: '#e8c4cb',
      tagBg: '#f3dce0', tagText: '#6b3344', primaryLight: '#fde8ee',
    },
  },
  {
    key: 'forest',
    label: 'Forest',
    colors: {
      bg: '#f0f5f0', surface: '#ffffff', primary: '#2d7d46',
      text: '#1a331a', textSecondary: '#4d724d', border: '#b8d4b8',
      tagBg: '#d4e5d4', tagText: '#2d5a2d', primaryLight: '#e0f2e4',
    },
  },
  {
    key: 'sunset',
    label: 'Sunset',
    colors: {
      bg: '#fef7ed', surface: '#ffffff', primary: '#d97706',
      text: '#3d2808', textSecondary: '#8a6d40', border: '#e8d0a8',
      tagBg: '#f2e2c6', tagText: '#6b4e1f', primaryLight: '#fef3c7',
    },
  },
  {
    key: 'lavender',
    label: 'Lavender',
    colors: {
      bg: '#f5f0fa', surface: '#ffffff', primary: '#7c3aed',
      text: '#2d1f47', textSecondary: '#7a6394', border: '#d0c0e0',
      tagBg: '#e4d8f0', tagText: '#5b3d80', primaryLight: '#ede9fe',
    },
  },
  {
    key: 'slate',
    label: 'Slate',
    colors: {
      bg: '#1e293b', surface: '#283548', primary: '#60a5fa',
      text: '#e2e8f0', textSecondary: '#94a3b8', border: '#3e4f66',
      tagBg: '#3e4f66', tagText: '#cbd5e1', primaryLight: '#1e3a5f',
    },
  },
];

function ThemePreview({ colors }: { colors: ThemeColors }) {
  return (
    <div className={styles.preview} style={{ backgroundColor: colors.bg }}>
      <div
        className={styles.previewHeader}
        style={{ backgroundColor: colors.surface, borderBottomColor: colors.border }}
      >
        <div className={styles.previewLogo} style={{ backgroundColor: colors.text }} />
        <div className={styles.previewNav}>
          <div className={styles.previewNavItem} style={{ backgroundColor: colors.textSecondary }} />
          <div className={styles.previewNavItem} style={{ backgroundColor: colors.textSecondary }} />
        </div>
      </div>
      <div className={styles.previewBody}>
        <div className={styles.previewCards}>
          {[0, 1].map(i => (
            <div
              key={i}
              className={styles.previewCard}
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <div className={styles.previewTitleLine} style={{ backgroundColor: colors.text }} />
              <div className={styles.previewTextLine} style={{ backgroundColor: colors.textSecondary }} />
              <div className={styles.previewTagRow}>
                <div className={styles.previewTag} style={{ backgroundColor: colors.tagBg }} />
                <div className={styles.previewTag} style={{ backgroundColor: colors.primaryLight }} />
              </div>
            </div>
          ))}
        </div>
        <div
          className={styles.previewButton}
          style={{ backgroundColor: colors.primary }}
        />
      </div>
    </div>
  );
}

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
        <div className={styles.panel}>
          <div className={styles.panelHeader}>Choose Theme</div>
          <div className={styles.grid}>
            {THEMES.map(opt => (
              <button
                key={opt.key}
                className={`${styles.card} ${theme === opt.key ? styles.cardActive : ''}`}
                onClick={() => {
                  setTheme(opt.key);
                  setIsOpen(false);
                }}
                aria-pressed={theme === opt.key}
              >
                <ThemePreview colors={opt.colors} />
                <span className={styles.cardLabel}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

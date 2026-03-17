import { useState, useRef } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { COLOR_SCHEMES } from '../../colorSchemes';
import { CloseIcon, PaletteIcon } from '../Icons/Icons';
import styles from './ThemeMenu.module.css';

export function ThemeMenu() {
  const { schemeId, setScheme } = useTheme();
  const [open, setOpen] = useState(false);
  const overlayMouseDownRef = useRef(false);

  return (
    <>
      <button
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-label="Change theme"
        title="Change theme"
      >
        <PaletteIcon size={18} />
      </button>

      {open && (
        <div
          className={styles.overlay}
          onMouseDown={e => {
            overlayMouseDownRef.current = e.target === e.currentTarget;
          }}
          onClick={e => {
            if (overlayMouseDownRef.current && e.target === e.currentTarget) {
              setOpen(false);
            }
            overlayMouseDownRef.current = false;
          }}
        >
          <div className={styles.panel}>
            <div className={styles.header}>
              <h3 className={styles.title}>Theme</h3>
              <button
                className={styles.close}
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <div className={styles.grid}>
              {COLOR_SCHEMES.map(scheme => (
                <button
                  key={scheme.id}
                  className={`${styles.card} ${scheme.id === schemeId ? styles.cardActive : ''}`}
                  onClick={() => {
                    setScheme(scheme.id);
                    setOpen(false);
                  }}
                >
                  <span className={styles.cardName}>{scheme.name}</span>
                  <span className={styles.cardType}>{scheme.type}</span>
                  <div className={styles.swatches}>
                    <span className={styles.swatch} style={{ background: scheme.colors['color-bg'] }} />
                    <span className={styles.swatch} style={{ background: scheme.colors['color-surface'] }} />
                    <span className={styles.swatch} style={{ background: scheme.colors['color-primary'] }} />
                    <span className={styles.swatch} style={{ background: scheme.colors['color-text'] }} />
                    <span className={styles.swatch} style={{ background: scheme.colors['color-danger'] }} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

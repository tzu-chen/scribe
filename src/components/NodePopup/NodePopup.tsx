import { useEffect, useRef, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import styles from './NodePopup.module.css';

interface NodePopupProps {
  anchorRect: DOMRect;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function NodePopup({ anchorRect, title, onClose, children }: NodePopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  // Position below the anchor icon, with boundary detection
  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    let top = anchorRect.bottom + 8;
    let left = anchorRect.left + anchorRect.width / 2 - rect.width / 2;

    // Keep within viewport
    if (left + rect.width > window.innerWidth - 8) {
      left = window.innerWidth - rect.width - 8;
    }
    if (left < 8) left = 8;

    if (top + rect.height > window.innerHeight - 8) {
      // Flip above the anchor
      top = anchorRect.top - rect.height - 8;
    }
    if (top < 8) top = 8;

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [anchorRect]);

  // Click outside + Escape to close
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={popupRef}
      className={styles.popup}
      style={{ left: anchorRect.left, top: anchorRect.bottom + 8 }}
    >
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className={styles.body}>
        {children}
      </div>
    </div>
  );
}

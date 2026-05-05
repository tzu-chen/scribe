import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useKeybindings } from '../../contexts/KeybindingsContext';
import { COLOR_SCHEMES } from '../../colorSchemes';
import { KEYBINDING_META, type KeybindingAction } from '../../types/keybindings';
import { CloseIcon, PaletteIcon } from '../Icons/Icons';
import styles from './SettingsMenu.module.css';

type Tab = 'theme' | 'shortcuts';

function formatKey(key: string): string {
  if (!key) return '—';
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function ShortcutRow({ action, label, scope }: { action: KeybindingAction; label: string; scope: string }) {
  const { keybindings, setKeybinding } = useKeybindings();
  const [recording, setRecording] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!recording) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(false);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;
      setKeybinding(action, e.key.toLowerCase());
      setRecording(false);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recording, action, setKeybinding]);

  return (
    <div className={styles.shortcutRow}>
      <div className={styles.shortcutInfo}>
        <span className={styles.shortcutLabel}>{label}</span>
        <span className={styles.shortcutScope}>{scope}</span>
      </div>
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.keyButton} ${recording ? styles.keyButtonRecording : ''}`}
        onClick={() => setRecording(r => !r)}
        title={recording ? 'Press a key (Esc to cancel)' : 'Click to rebind'}
      >
        {recording ? 'Press a key…' : formatKey(keybindings[action])}
      </button>
    </div>
  );
}

function findDuplicate(action: KeybindingAction, key: string, all: Record<KeybindingAction, string>): KeybindingAction | null {
  for (const other of Object.keys(all) as KeybindingAction[]) {
    if (other !== action && all[other] === key) return other;
  }
  return null;
}

export function SettingsMenu() {
  const { schemeId, setScheme, autoSwitch, setAutoSwitch } = useTheme();
  const { keybindings, resetKeybindings } = useKeybindings();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('theme');
  const overlayMouseDownRef = useRef(false);

  const conflicts = KEYBINDING_META.filter(m => findDuplicate(m.action, keybindings[m.action], keybindings));

  return (
    <>
      <button
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-label="Open settings"
        title="Settings"
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
              <div className={styles.tabs}>
                <button
                  className={`${styles.tab} ${tab === 'theme' ? styles.tabActive : ''}`}
                  onClick={() => setTab('theme')}
                >
                  Theme
                </button>
                <button
                  className={`${styles.tab} ${tab === 'shortcuts' ? styles.tabActive : ''}`}
                  onClick={() => setTab('shortcuts')}
                >
                  Shortcuts
                </button>
              </div>
              <button
                className={styles.close}
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            {tab === 'theme' && (
              <div className={styles.body}>
                <div className={styles.autoSwitch}>
                  <div className={styles.autoSwitchInfo}>
                    <span className={styles.autoSwitchLabel}>Auto switch</span>
                    <span className={styles.autoSwitchDesc}>
                      Light theme by day, dark by night
                    </span>
                  </div>
                  <button
                    className={`${styles.toggle} ${autoSwitch.enabled ? styles.toggleOn : ''}`}
                    onClick={() => setAutoSwitch({ ...autoSwitch, enabled: !autoSwitch.enabled })}
                    role="switch"
                    aria-checked={autoSwitch.enabled}
                    aria-label="Auto theme switching"
                  >
                    <span className={styles.toggleThumb} />
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
                      <div className={styles.preview}>
                        <div
                          className={styles.swatchBg}
                          style={{ background: scheme.colors['color-bg'] }}
                        >
                          <div
                            className={styles.swatchBar}
                            style={{
                              background: scheme.colors['color-surface'],
                              borderBottom: `2px solid ${scheme.colors['color-border']}`,
                            }}
                          />
                          <div className={styles.swatchBody}>
                            <div
                              className={styles.swatchCard}
                              style={{
                                background: scheme.colors['color-surface'],
                                border: `1px solid ${scheme.colors['color-border']}`,
                              }}
                            >
                              <div
                                className={styles.swatchText}
                                style={{ background: scheme.colors['color-text'] }}
                              />
                              <div
                                className={`${styles.swatchText} ${styles.swatchTextShort}`}
                                style={{ background: scheme.colors['color-text-secondary'] }}
                              />
                            </div>
                            <div
                              className={styles.swatchAccent}
                              style={{ background: scheme.colors['color-primary'] }}
                            />
                          </div>
                        </div>
                      </div>
                      <span className={styles.cardName}>{scheme.name}</span>
                      <span className={styles.cardType}>{scheme.type}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === 'shortcuts' && (
              <div className={styles.body}>
                <p className={styles.shortcutsHint}>
                  Click a key to rebind. Shortcuts only fire when no input is focused.
                </p>
                <div className={styles.shortcutList}>
                  {KEYBINDING_META.map(m => (
                    <ShortcutRow
                      key={m.action}
                      action={m.action}
                      label={m.label}
                      scope={m.scope}
                    />
                  ))}
                </div>
                {conflicts.length > 0 && (
                  <p className={styles.shortcutsWarning}>
                    Duplicate key assigned — only one action will fire.
                  </p>
                )}
                <div className={styles.shortcutActions}>
                  <button className={styles.resetButton} onClick={resetKeybindings}>
                    Reset to defaults
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

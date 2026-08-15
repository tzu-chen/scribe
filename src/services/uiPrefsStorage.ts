import { DEFAULT_UI_PREFS, type UiPrefs } from '../types/uiPrefs';

const STORAGE_KEY = 'scribe_ui_prefs';

export const uiPrefsStorage = {
  get(): UiPrefs {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_UI_PREFS };
    try {
      const parsed = JSON.parse(raw) as Partial<UiPrefs>;
      return { ...DEFAULT_UI_PREFS, ...parsed };
    } catch {
      return { ...DEFAULT_UI_PREFS };
    }
  },

  save(prefs: UiPrefs): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  },
};

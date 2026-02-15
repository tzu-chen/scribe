export type ThemeName = 'default' | 'dark' | 'warm' | 'ocean' | 'high-contrast';

const STORAGE_KEY = 'scribe_theme';

const VALID_THEMES: ThemeName[] = ['default', 'dark', 'warm', 'ocean', 'high-contrast'];

export const themeStorage = {
  get(): ThemeName {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && VALID_THEMES.includes(raw as ThemeName)) {
      return raw as ThemeName;
    }
    return 'default';
  },

  save(theme: ThemeName): void {
    localStorage.setItem(STORAGE_KEY, theme);
  },
};

import { COLOR_SCHEMES, DEFAULT_SCHEME_ID } from '../colorSchemes';

const STORAGE_KEY = 'scribe_theme';

/** Map old stored values to new scheme IDs for backward compatibility. */
const LEGACY_MAP: Record<string, string> = {
  default: 'default-light',
  dark: 'default-dark',
};

export const themeStorage = {
  get(): string {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SCHEME_ID;
    const mapped = LEGACY_MAP[raw] ?? raw;
    if (COLOR_SCHEMES.some(s => s.id === mapped)) return mapped;
    return DEFAULT_SCHEME_ID;
  },

  save(schemeId: string): void {
    localStorage.setItem(STORAGE_KEY, schemeId);
  },
};

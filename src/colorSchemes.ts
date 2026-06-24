export interface ColorScheme {
  id: string;
  name: string;
  type: 'light' | 'dark';
  colors: Record<string, string>;
}

const light: ColorScheme = {
  id: 'light',
  name: 'Light',
  type: 'light',
  colors: {
    'color-bg': '#f8f9fa',
    'color-surface': '#ffffff',
    'color-border': '#dee2e6',
    'color-border-light': '#e9ecef',
    'color-text': '#212529',
    'color-text-secondary': '#6c757d',
    'color-primary': '#4263eb',
    'color-primary-hover': '#3b5bdb',
    'color-primary-light': '#edf2ff',
    'color-primary-text': '#ffffff',
    'color-danger': '#e03131',
    'color-danger-hover': '#c92a2a',
    'color-danger-light': 'rgba(224, 49, 49, 0.08)',
    'color-success': '#2f9e44',
    'color-warning': '#f08c00',
    'color-tag-bg': '#e9ecef',
    'color-tag-text': '#495057',
    'color-draft-bg': '#fff3bf',
    'color-draft-text': '#e67700',
    'color-published-bg': '#d3f9d8',
    'color-published-text': '#2b8a3e',
    'color-overlay-light': 'rgba(0, 0, 0, 0.1)',
    'color-pdf-bg': '#e8e8e8',
    'pdf-highlight-blend': 'multiply',
    'pdf-highlight-opacity': '0.5',
    'pdf-highlight-opacity-hover': '0.65',
    'pdf-selection-bg': '#a8c7fa',
    'shadow-sm': '0 1px 3px rgba(0, 0, 0, 0.08)',
    'shadow-md': '0 4px 12px rgba(0, 0, 0, 0.1)',
    'shadow-lg': '0 8px 24px rgba(0, 0, 0, 0.15)',
  },
};

const dark: ColorScheme = {
  id: 'dark',
  name: 'Dark',
  type: 'dark',
  colors: {
    'color-bg': '#2e3440',
    'color-surface': '#3b4252',
    'color-border': '#4c566a',
    'color-border-light': '#434c5e',
    'color-text': '#eceff4',
    'color-text-secondary': '#d8dee9',
    'color-primary': '#88c0d0',
    'color-primary-hover': '#8fbcbb',
    'color-primary-light': '#2e3a40',
    'color-primary-text': '#2e3440',
    'color-danger': '#bf616a',
    'color-danger-hover': '#d08770',
    'color-danger-light': 'rgba(191, 97, 106, 0.15)',
    'color-success': '#a3be8c',
    'color-warning': '#ebcb8b',
    'color-tag-bg': '#434c5e',
    'color-tag-text': '#d8dee9',
    'color-draft-bg': '#3a3828',
    'color-draft-text': '#ebcb8b',
    'color-published-bg': '#2a3a28',
    'color-published-text': '#a3be8c',
    'color-overlay-light': 'rgba(255, 255, 255, 0.08)',
    'color-pdf-bg': '#3b4252',
    // The PDF canvas is inverted in dark mode, so the page reads dark.
    // `screen` lightens the highlight/selection so it stays visible;
    // `multiply` would darken against the dark page and vanish.
    'pdf-highlight-blend': 'screen',
    'pdf-highlight-opacity': '0.55',
    'pdf-highlight-opacity-hover': '0.7',
    'pdf-selection-bg': '#4c6ef5',
    'shadow-sm': '0 1px 3px rgba(0, 0, 0, 0.3)',
    'shadow-md': '0 4px 12px rgba(0, 0, 0, 0.4)',
    'shadow-lg': '0 8px 24px rgba(0, 0, 0, 0.5)',
  },
};

export const COLOR_SCHEMES: ColorScheme[] = [light, dark];

export const DEFAULT_SCHEME_ID = 'light';
export const DEFAULT_LIGHT_SCHEME_ID = 'light';
export const DEFAULT_DARK_SCHEME_ID = 'dark';

export function getSchemeById(id: string): ColorScheme {
  return COLOR_SCHEMES.find(s => s.id === id) ?? light;
}

export function applyColorScheme(scheme: ColorScheme): void {
  const style = document.documentElement.style;
  for (const [key, value] of Object.entries(scheme.colors)) {
    style.setProperty(`--${key}`, value);
  }
  if (scheme.type === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

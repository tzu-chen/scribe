/**
 * Colour schemes.
 *
 * Two schemes, shared across the suite: "Parchment" (light) and "Graphite"
 * (dark). The palette itself lives in `src/monolith-theme.css` — this module
 * only decides which theme is active and flips the attributes the stylesheet
 * keys off. It deliberately does NOT write colours as inline styles: inline
 * styles on <html> outrank any stylesheet, which would give the app a second,
 * silently-winning source of colour.
 *
 * `swatch` is the one exception — a handful of representative colours the
 * settings menu paints into its theme-preview thumbnails, where there is no
 * element to read the cascade from. Keep it in step with monolith-theme.css.
 */

export interface ColorScheme {
  id: string;
  name: string;
  type: 'light' | 'dark';
  /** Preview-thumbnail colours only. Everything else reads the cascade. */
  swatch: {
    bg: string;
    surface: string;
    border: string;
    text: string;
    textSecondary: string;
    accent: string;
  };
}

const parchment: ColorScheme = {
  id: 'parchment',
  name: 'Parchment',
  type: 'light',
  swatch: {
    bg: '#faf8f4',
    surface: '#ffffff',
    border: '#e2ddd3',
    text: '#2c2820',
    textSecondary: '#6b6358',
    accent: '#8b5e3c',
  },
};

const graphite: ColorScheme = {
  id: 'graphite',
  name: 'Graphite',
  type: 'dark',
  swatch: {
    bg: '#15161a',
    surface: '#0f1013',
    border: '#2b2e35',
    text: '#e4e6ea',
    textSecondary: '#c2c7cf',
    accent: '#d99a4e',
  },
};

export const COLOR_SCHEMES: ColorScheme[] = [parchment, graphite];

export const DEFAULT_SCHEME_ID = 'parchment';
export const DEFAULT_LIGHT_SCHEME_ID = 'parchment';
export const DEFAULT_DARK_SCHEME_ID = 'graphite';

export function getSchemeById(id: string): ColorScheme {
  return COLOR_SCHEMES.find(s => s.id === id) ?? parchment;
}

export function applyColorScheme(scheme: ColorScheme): void {
  const root = document.documentElement;
  root.dataset.theme = scheme.type;
  root.dataset.scheme = scheme.id;
}

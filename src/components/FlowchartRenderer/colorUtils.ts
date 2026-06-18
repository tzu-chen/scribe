import type { FlowchartStage } from '../../types/flowchart';

type ColorRole = keyof FlowchartStage['colors'];

function hexToHSL(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 50];

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }

  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function adjustColorForDark(hex: string, role: ColorRole): string {
  const [h, s, l] = hexToHSL(hex);

  switch (role) {
    case 'background':
      return hslToHex(h, Math.min(s + 10, 100), Math.min(l * 0.28, 25));
    case 'border':
      return hslToHex(h, s, Math.min(l * 0.55, 45));
    case 'divider':
      return hslToHex(h, s * 0.8, Math.min(l * 0.5, 40));
    case 'title':
      return hslToHex(h, Math.min(s * 0.6, 40), Math.max(l, 85));
    case 'refs':
    case 'topics':
      return hslToHex(h, Math.min(s * 0.5, 30), Math.max(l, 78));
    case 'labelText':
      return hslToHex(h, Math.min(s * 0.5, 30), Math.max(l, 75));
    default:
      return hex;
  }
}

export function adjustStageColorsForDark(
  colors: FlowchartStage['colors'],
): FlowchartStage['colors'] {
  const result = {} as FlowchartStage['colors'];
  for (const key of Object.keys(colors) as ColorRole[]) {
    result[key] = adjustColorForDark(colors[key], key);
  }
  return result;
}

// Per-role saturation/lightness targets, derived from the SKILL.md example
// palettes, that turn a single accent hue into the full 7-role light-mode set.
// Keeping S/L fixed (and only taking the hue from the accent) guarantees a
// harmonious pastel card regardless of how saturated the picked accent is.
const PALETTE_ROLES: Record<ColorRole, { s: number; l: number }> = {
  background: { s: 55, l: 94 },
  border: { s: 38, l: 69 },
  divider: { s: 38, l: 69 },
  title: { s: 46, l: 33 },
  labelText: { s: 46, l: 33 },
  refs: { s: 32, l: 37 },
  topics: { s: 28, l: 43 },
};

/**
 * Generate a complete light-mode stage palette from a single accent color.
 * Only the accent's hue is used; saturation/lightness come from PALETTE_ROLES
 * so the result always reads as a soft, printable pastel that matches the
 * existing flowchart aesthetic. Dark mode is still derived on the fly via
 * `adjustStageColorsForDark`, so only the light-mode set is stored in the spec.
 */
export function generateStagePalette(accentHex: string): FlowchartStage['colors'] {
  const [h] = hexToHSL(accentHex);
  const result = {} as FlowchartStage['colors'];
  for (const key of Object.keys(PALETTE_ROLES) as ColorRole[]) {
    const { s, l } = PALETTE_ROLES[key];
    result[key] = hslToHex(h, s, l);
  }
  return result;
}

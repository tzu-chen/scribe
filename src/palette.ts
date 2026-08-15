/**
 * Categorical palette — the JS side of `src/monolith-theme.css`.
 *
 * These are the colours the app *stores* rather than the ones it renders
 * chrome with: a tag's colour, a flowchart stage band, a per-book series in a
 * chart. They are written into the database and into flowchart specs, so they
 * cannot be CSS variables that flip with the theme — a tag picked in Parchment
 * must keep the same colour in Graphite.
 *
 * They are drawn from the suite's categorical ramp (`--mono-cat-1…7` and the
 * same-weight extensions below), so a stored colour still sits inside the
 * palette instead of next to it. All entries carry roughly the same perceived
 * weight, so no series dominates, and all are dark enough to take `#fffef9`
 * (`--color-on-solid`) as ink when used as a solid fill.
 */

/** `--mono-cat-1…7`, Parchment values. */
export const CAT = {
  brown: '#8b5e3c',
  blue: '#3d6b8e',
  violet: '#7a5a99',
  teal: '#3d8080',
  amber: '#b07830',
  red: '#b04a4a',
  neutral: '#6b6358',
} as const;

/**
 * The full 15-step picker ramp: `--mono-cat-1…15` in monolith-theme.css —
 * the seven canonical categoricals plus eight same-weight extensions, ordered
 * so adjacent choices stay distinguishable.
 */
export const CATEGORICAL_PALETTE = [
  CAT.brown,
  CAT.blue,
  CAT.violet,
  CAT.teal,
  CAT.amber,
  CAT.red,
  CAT.neutral,
  '#6f7a3d', // olive
  '#a4517a', // rose
  '#4f5a99', // indigo
  '#3d8060', // sea
  '#a06a45', // clay
  '#4a5a6b', // slate
  '#6b4a7a', // plum
  '#5a7a4a', // moss
] as const;

/** Series colours for charts — the ramp, taken in order. */
export const SERIES_PALETTE = CATEGORICAL_PALETTE.slice(0, 12);

/** Flowchart stage bands, in the order new stages are created. */
export const STAGE_ACCENTS = [
  CAT.amber,
  CAT.red,
  CAT.violet,
  CAT.blue,
  CAT.teal,
  '#5a7a4a',
] as const;

export function randomCategorical(): string {
  return CATEGORICAL_PALETTE[Math.floor(Math.random() * CATEGORICAL_PALETTE.length)];
}

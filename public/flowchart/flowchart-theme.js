/**
 * flowchart-theme.js
 *
 * Handles dark-mode recoloring of elements whose colors are set via inline
 * styles in the flowchart HTML (stage labels and timeline cells). These
 * cannot be targeted by CSS alone, so this script reads the original inline
 * color values and swaps them when <html data-theme="dark"> is toggled.
 *
 * Injected by FlowchartsPage.tsx at runtime — flowchart HTML files are NOT
 * modified. Works for any flowchart HTML file in the /flowchart/ directory.
 */
(function () {
  /** Light-mode hex → dark-mode hex for all inline-styled colors. */
  var DARK = {
    /* Stage label text */
    '#7a6530': '#d4b86a',
    '#8a5030': '#e0905a',
    '#7a3a3a': '#e08080',
    '#5a3070': '#c080e8',
    '#2a4a70': '#7aaad8',
    '#1a5a50': '#60c8b8',
    '#8a8a80': '#6a6a62',
    /* Timeline cell backgrounds */
    '#f6f0e4': '#1e1a10',
    '#f4ebe2': '#1e1610',
    '#f2e6e2': '#1e1212',
    '#ece6f0': '#1a1220',
    '#e6ecf2': '#101620',
    '#e4f0ee': '#0c1a18',
  };

  /** Normalise an inline style color value to a lowercase hex string. */
  function norm(str) {
    return str ? str.toLowerCase().trim() : '';
  }

  /**
   * Collected entries: { el, prop, light }
   * - el:    the DOM element
   * - prop:  'color' or 'background'
   * - light: the original inline value (preserved for light-mode restore)
   */
  var entries = [];

  function collect() {
    /* Stage labels that carry an inline color: */
    document.querySelectorAll('.stage-lbl[style]').forEach(function (el) {
      var v = el.style.color;
      if (v) entries.push({ el: el, prop: 'color', light: v });
    });

    /* Timeline bar cells that carry inline background / color: */
    document.querySelectorAll('.timeline-bar > div').forEach(function (el) {
      var bg = el.style.background || el.style.backgroundColor;
      var fg = el.style.color;
      if (bg) entries.push({ el: el, prop: 'background', light: bg });
      if (fg) entries.push({ el: el, prop: 'color',      light: fg });
    });
  }

  function apply(isDark) {
    entries.forEach(function (e) {
      if (isDark) {
        var dark = DARK[norm(e.light)];
        if (dark) e.el.style[e.prop] = dark;
      } else {
        e.el.style[e.prop] = e.light;
      }
    });
  }

  /* Run once on load. */
  collect();
  apply(document.documentElement.getAttribute('data-theme') === 'dark');

  /* React to future data-theme changes set directly by the parent frame. */
  new MutationObserver(function () {
    apply(document.documentElement.getAttribute('data-theme') === 'dark');
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
})();

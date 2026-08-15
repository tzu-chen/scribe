/** How the PDF viewer's table of contents is laid out.
 *  - 'panel'    — docked beside the document; opening it narrows the page area.
 *  - 'floating' — hovers over the document, leaving its width untouched (so
 *                 toggling the TOC never re-renders pages at a new zoom). */
export type TocMode = 'panel' | 'floating';

/** Global (not per-attachment) UI preferences. Per-attachment viewer state
 *  lives in viewerPrefsStorage instead. */
export interface UiPrefs {
  tocMode: TocMode;
}

export const DEFAULT_UI_PREFS: UiPrefs = {
  tocMode: 'panel',
};

export type KeybindingAction =
  | 'pdfTocToggle'
  | 'pdfFitWidthToggle'
  | 'pdfTwoPageToggle'
  | 'pdfPanelToggle'
  | 'pdfImmersiveToggle'
  | 'pdfAutoTrimToggle'
  | 'goToLibrary';

export interface KeybindingMeta {
  action: KeybindingAction;
  label: string;
  scope: string;
  defaultKey: string;
}

export const KEYBINDING_META: KeybindingMeta[] = [
  { action: 'pdfTocToggle', label: 'Toggle table of contents', scope: 'PDF viewer', defaultKey: 't' },
  { action: 'pdfFitWidthToggle', label: 'Toggle fit width', scope: 'PDF viewer', defaultKey: 'w' },
  { action: 'pdfTwoPageToggle', label: 'Toggle two-page view', scope: 'PDF viewer', defaultKey: 'd' },
  { action: 'pdfPanelToggle', label: 'Toggle right panel', scope: 'PDF viewer', defaultKey: 'p' },
  { action: 'pdfImmersiveToggle', label: 'Toggle fullscreen', scope: 'PDF viewer', defaultKey: 'f' },
  { action: 'pdfAutoTrimToggle', label: 'Toggle auto-trim margins', scope: 'PDF viewer', defaultKey: 'c' },
  { action: 'goToLibrary', label: 'Go to Library', scope: 'Global', defaultKey: 'l' },
];

export type KeybindingsConfig = Record<KeybindingAction, string>;

export const DEFAULT_KEYBINDINGS: KeybindingsConfig = KEYBINDING_META.reduce(
  (acc, m) => ({ ...acc, [m.action]: m.defaultKey }),
  {} as KeybindingsConfig,
);

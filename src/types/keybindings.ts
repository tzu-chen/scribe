export type KeybindingAction =
  | 'pdfTocToggle'
  | 'pdfFitWidthToggle'
  | 'pdfPanelToggle'
  | 'pdfImmersiveToggle'
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
  { action: 'pdfPanelToggle', label: 'Toggle right panel', scope: 'PDF viewer', defaultKey: 'p' },
  { action: 'pdfImmersiveToggle', label: 'Toggle fullscreen', scope: 'PDF viewer', defaultKey: 'f' },
  { action: 'goToLibrary', label: 'Go to Library', scope: 'Global', defaultKey: 'l' },
];

export type KeybindingsConfig = Record<KeybindingAction, string>;

export const DEFAULT_KEYBINDINGS: KeybindingsConfig = KEYBINDING_META.reduce(
  (acc, m) => ({ ...acc, [m.action]: m.defaultKey }),
  {} as KeybindingsConfig,
);

/**
 * A linked folder: a directory on the server's disk whose PDFs are tracked in
 * place (see server/lib/sources.ts). Its items are ordinary library items with
 * `sourceId` + `relPath` set.
 */
export interface Source {
  id: string;
  name: string;
  /** Absolute path, with the home directory shown as ~. */
  path: string;
  recursive: boolean;
  /** gitignore-style patterns, relative to the folder root. */
  exclude: string[];
  createdAt: string;
  lastScanAt?: string;
  /** Folder unreachable (unmounted, renamed); its items are left as they were. */
  offline: boolean;
  error?: string;
  itemCount: number;
  missingCount: number;
  highlightCount: number;
}

export interface SourceSettings {
  path: string;
  recursive: boolean;
  exclude: string[];
}

export interface SourcePreview {
  path: string;
  total: number;
  /** First few hundred documents that would be taken in. */
  files: Array<{ relPath: string; size: number }>;
  /** Uploaded items with identical content, which can be converted in place. */
  matches: Array<{ relPath: string; attachmentId: string; title: string }>;
  /** Editing only: linked items the new settings would drop from the library. */
  removals: { count: number; withHighlights: number };
}

export interface ScanSummary {
  added: number;
  updated: number;
  moved: number;
  adopted: number;
  missing: number;
  removed: number;
  offline: boolean;
}

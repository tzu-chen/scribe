export interface NodeAttachmentLink {
  flowchartId: string;
  nodeKey: string;
  title: string;
  flowchartName: string;
}

/** What an item *is*. Guessed at upload / enrichment, overridable by hand. */
export type AttachmentKind = 'book' | 'paper' | 'draft' | 'notes' | 'other';

export const ATTACHMENT_KINDS: AttachmentKind[] = ['book', 'paper', 'draft', 'notes', 'other'];

export const KIND_LABELS: Record<AttachmentKind, { singular: string; plural: string }> = {
  book: { singular: 'Book', plural: 'Books' },
  paper: { singular: 'Paper', plural: 'Papers' },
  draft: { singular: 'Draft', plural: 'Drafts' },
  notes: { singular: 'Notes', plural: 'Notes & slides' },
  other: { singular: 'Other', plural: 'Other' },
};

/** Manual reading status. Everything else about activity is derived. */
export type AttachmentStatus = 'done';

export interface AttachmentMeta {
  id: string;
  subject: string;
  filename: string;
  type: string;
  size: number;
  createdAt: string;
  lastOpenedAt?: string;
  /** Projects (folders) this item belongs to — many-to-many. */
  folderIds: string[];
  tags?: string[];
  nodeAttachments?: NodeAttachmentLink[];
  /** Undefined = not yet classified ("unsorted"). */
  kind?: AttachmentKind;
  /** True when the kind was chosen by hand and must not be re-guessed. */
  kindManual?: boolean;
  /** Display title from PDF metadata or set by hand; fall back to filename. */
  title?: string;
  authors?: string;
  year?: number;
  pageCount?: number;
  status?: AttachmentStatus;
  /** Last viewed page, from viewer_prefs. */
  currentPage?: number;
  hasThumbnail?: boolean;
  /** Set once the client has parsed the file (page count, metadata, thumbnail). */
  enrichedAt?: string;
  /** Linked folder this item lives in (see Source); undefined for uploads. */
  sourceId?: string;
  /** Path inside the linked folder, '/'-separated. */
  relPath?: string;
  /** Last modification of a linked file on disk. */
  fileModifiedAt?: string;
  /** A linked file that has disappeared from disk; kept so its annotations survive. */
  missing?: boolean;
}

export interface Attachment extends AttachmentMeta {
  data: Blob;
}

/** A "project" in the UI: a non-exclusive grouping of attachments. */
export interface Folder {
  id: string;
  name: string;
  createdAt: string;
  /** Set when the project is finished; archived projects are tucked away in the UI. */
  archivedAt?: string;
}

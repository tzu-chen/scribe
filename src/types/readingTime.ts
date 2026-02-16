/**
 * A single persisted reading-time record.
 * One record per (attachmentId, dateCST) pair.
 * `dateCST` is a "YYYY-MM-DD" string in CST (UTC-6).
 */
export interface ReadingTimeEntry {
  attachmentId: string;
  filename: string;
  dateCST: string;
  totalSeconds: number;
}

/**
 * Shape of the localStorage value: keyed by "attachmentId::dateCST".
 */
export type ReadingTimeMap = Record<string, ReadingTimeEntry>;

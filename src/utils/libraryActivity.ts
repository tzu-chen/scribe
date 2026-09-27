import type { AttachmentMeta } from '../types/attachment';
import { stripExtension } from './filename';

/**
 * Where the reader stands with an item. Derived entirely from data the app
 * already records (last opened, viewer position, manual "done"), so it costs
 * no input.
 */
export type Activity = 'reading' | 'paused' | 'unopened' | 'dormant' | 'done';

export const ACTIVITY_LABELS: Record<Activity, string> = {
  reading: 'Reading',
  paused: 'Paused',
  unopened: 'Unopened',
  dormant: 'Dormant',
  done: 'Done',
};

export const ACTIVITY_ORDER: Activity[] = ['reading', 'paused', 'unopened', 'dormant', 'done'];

const DAY = 86_400_000;
export const READING_WINDOW_DAYS = 14;
export const DORMANT_AFTER_DAYS = 180;

export function getActivity(meta: AttachmentMeta, now = Date.now()): Activity {
  if (meta.status === 'done') return 'done';
  if (!meta.lastOpenedAt) return 'unopened';
  const age = now - new Date(meta.lastOpenedAt).getTime();
  if (age <= READING_WINDOW_DAYS * DAY) return 'reading';
  if (age >= DORMANT_AFTER_DAYS * DAY) return 'dormant';
  return 'paused';
}

/** 0..1 fraction read, or null when unknown. */
export function getProgress(meta: AttachmentMeta): number | null {
  if (meta.status === 'done') return 1;
  if (!meta.pageCount || meta.pageCount <= 0 || !meta.currentPage) return null;
  return Math.max(0, Math.min(1, meta.currentPage / meta.pageCount));
}

export function displayTitle(meta: AttachmentMeta): string {
  const t = meta.title?.trim();
  return t && t.length > 0 ? t : stripExtension(meta.filename);
}

/** Items worth resuming: recently active, or part-way through and not dormant. */
export function isContinueCandidate(meta: AttachmentMeta, now = Date.now()): boolean {
  const activity = getActivity(meta, now);
  if (activity === 'reading') return true;
  if (activity !== 'paused') return false;
  const p = getProgress(meta);
  return p !== null && p > 0.03 && p < 0.97;
}

export function formatRelativeDate(iso: string | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const diff = now - new Date(iso).getTime();
  const days = Math.floor(diff / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? '1 yr ago' : `${years} yr ago`;
}

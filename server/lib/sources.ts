import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { db, DATA_DIR, ATTACHMENTS_DIR, THUMBNAILS_DIR } from '../db.ts';
import { guessKind } from './kindGuess.ts';
import { compilePatterns, exactPattern, isExcludedPath, matchesPattern, type CompiledPattern } from './excludePatterns.ts';

// Linked folders ("sources"): directories whose PDFs are tracked in place.
//
// The disk is the source of truth and a full reconcile scan is the only thing
// that writes: file watchers merely schedule scans, and so do server start-up
// and the Library page opening. A scan never deletes an item because its file
// disappeared — highlights, comments and outlines CASCADE on delete — it only
// sets missing_at. Items are deleted only when the user excludes them (by
// pattern, or "Remove from library"), unlinks the folder, or clears missing
// items.
//
// Identity is the path relative to the folder root. A path that vanished and a
// new path with the same sha256 in the same scan is treated as a move.

const DOC_EXTENSIONS = new Set(['.pdf', '.djvu']);
const ALWAYS_SKIPPED = new Set(['node_modules', '__pycache__']);
const MAX_DIRS = 20_000;
const MAX_FILES = 5_000;
/** A new or changed file must sit untouched this long before it is taken in. */
const SETTLE_MS = 2_000;
/** A PDF must also end in %%EOF (pdflatex truncates, then rewrites) unless left alone this long. */
const SETTLE_BROKEN_MS = 60_000;
const WATCH_DEBOUNCE_MS = 1_000;
/** "Scan everything" requests (Library page open) skip sources scanned more recently than this. */
const SCAN_ALL_MIN_INTERVAL_MS = 10_000;
const PREVIEW_LIST_LIMIT = 500;

export class SourceError extends Error {}

export interface SourceRow {
  id: string;
  name: string;
  root_path: string;
  recursive: number;
  exclude: string;
  created_at: string;
  last_scan_at: string | null;
  offline_since: string | null;
  error: string | null;
}

interface LinkedRow {
  id: string;
  rel_path: string;
  size: number;
  mtime_ms: number | null;
  sha256: string | null;
  missing_at: string | null;
  thumbnail_path: string | null;
}

interface DiskFile {
  size: number;
  mtimeMs: number;
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

export interface ScanOptions {
  /** Uploaded (unlinked) attachments the user agreed to convert when their content turns up in the folder. */
  adoptIds?: Set<string>;
}

/** Emits 'changed' ({ sourceId }) whenever a scan or source edit changed what the library shows. */
export const sourceEvents = new EventEmitter();
sourceEvents.setMaxListeners(0);

// --- Paths -----------------------------------------------------------------

function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function tildify(p: string): string {
  const home = os.homedir();
  return isInside(p, home) ? '~' + p.slice(home.length) : p;
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

function realpathOr(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** Folders may only be linked under these (SCRIBE_SOURCE_ROOTS, ':'-separated; default: home). */
function allowedRoots(): string[] {
  const raw = process.env.SCRIBE_SOURCE_ROOTS;
  const list = raw ? raw.split(path.delimiter).filter(Boolean) : [os.homedir()];
  return list.map(p => realpathOr(expandHome(p)));
}

/** Validate a user-supplied folder path and return its canonical form. */
function resolveRoot(input: string, selfId?: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new SourceError('Enter a folder path.');
  const expanded = expandHome(trimmed);
  if (!path.isAbsolute(expanded)) throw new SourceError('Use an absolute path, or one starting with ~/.');
  let real: string;
  try {
    real = fs.realpathSync(expanded);
  } catch {
    throw new SourceError(`No such folder: ${trimmed}`);
  }
  if (!fs.statSync(real).isDirectory()) throw new SourceError('That path is a file, not a folder.');
  const roots = allowedRoots();
  if (!roots.some(r => isInside(real, r))) {
    throw new SourceError(`Linked folders must be inside ${roots.map(tildify).join(' or ')}. Set SCRIBE_SOURCE_ROOTS to allow others.`);
  }
  const dataDir = realpathOr(DATA_DIR);
  if (isInside(real, dataDir) || isInside(dataDir, real)) {
    throw new SourceError("That folder overlaps Scribe's own data directory.");
  }
  for (const s of listSourceRows()) {
    if (s.id === selfId) continue;
    if (isInside(real, s.root_path) || isInside(s.root_path, real)) {
      throw new SourceError(`That folder overlaps the linked folder "${s.name}".`);
    }
  }
  return real;
}

/** Absolute path of an attachment's file, managed or linked; null if it cannot be resolved. */
export function attachmentFilePath(row: { file_path: string; source_id?: string | null; rel_path?: string | null }): string | null {
  if (!row.source_id) return path.join(ATTACHMENTS_DIR, row.file_path);
  const src = getSourceRow(row.source_id);
  if (!src || !row.rel_path) return null;
  const abs = path.resolve(src.root_path, row.rel_path);
  return isInside(abs, src.root_path) ? abs : null;
}

export function mimeTypeFor(filename: string): string {
  return path.extname(filename).toLowerCase() === '.djvu' ? 'image/vnd.djvu' : 'application/pdf';
}

// --- Rows ------------------------------------------------------------------

export function getSourceRow(id: string): SourceRow | undefined {
  return db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as SourceRow | undefined;
}

export function listSourceRows(): SourceRow[] {
  return db.prepare('SELECT * FROM sources ORDER BY name COLLATE NOCASE').all() as SourceRow[];
}

function parseExclude(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function listSources() {
  const counts = new Map(
    (db.prepare(`
      SELECT source_id, COUNT(*) AS items, SUM(missing_at IS NOT NULL) AS missing
      FROM attachments WHERE source_id IS NOT NULL GROUP BY source_id
    `).all() as Array<{ source_id: string; items: number; missing: number }>).map(r => [r.source_id, r]),
  );
  const highlights = new Map(
    (db.prepare(`
      SELECT a.source_id, COUNT(*) AS n FROM highlights h
      JOIN attachments a ON a.id = h.attachment_id
      WHERE a.source_id IS NOT NULL GROUP BY a.source_id
    `).all() as Array<{ source_id: string; n: number }>).map(r => [r.source_id, r.n]),
  );
  return listSourceRows().map(row => ({
    id: row.id,
    name: row.name,
    path: tildify(row.root_path),
    recursive: row.recursive === 1,
    exclude: parseExclude(row.exclude),
    createdAt: row.created_at,
    lastScanAt: row.last_scan_at ?? undefined,
    offline: !!row.offline_since,
    error: row.error ?? undefined,
    itemCount: counts.get(row.id)?.items ?? 0,
    missingCount: counts.get(row.id)?.missing ?? 0,
    highlightCount: highlights.get(row.id) ?? 0,
  }));
}

// --- Walking ---------------------------------------------------------------

function isSkippedName(name: string): boolean {
  return name.startsWith('.') || ALWAYS_SKIPPED.has(name);
}

function isDocName(name: string): boolean {
  return DOC_EXTENSIONS.has(path.extname(name).toLowerCase());
}

/** Whether a relative path lies outside what the folder's settings take in. */
function isOutOfScope(rel: string, recursive: boolean, patterns: CompiledPattern[]): boolean {
  const segments = rel.split('/');
  if (!recursive && segments.length > 1) return true;
  if (segments.some(isSkippedName) || !isDocName(rel)) return true;
  return isExcludedPath(patterns, rel);
}

interface WalkResult {
  files: Map<string, DiskFile>;
  /** Absolute paths of every directory visited — the set to watch. */
  dirs: string[];
}

async function walk(root: string, recursive: boolean, patterns: CompiledPattern[]): Promise<WalkResult> {
  const files = new Map<string, DiskFile>();
  const dirs: string[] = [];
  const queue: string[] = [''];
  while (queue.length > 0) {
    const relDir = queue.shift()!;
    const absDir = relDir ? path.join(root, relDir) : root;
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(absDir, { withFileTypes: true });
    } catch (err) {
      if (relDir === '') throw err;
      continue; // unreadable subdirectory
    }
    dirs.push(absDir);
    if (dirs.length > MAX_DIRS) {
      throw new SourceError(`More than ${MAX_DIRS.toLocaleString()} folders — link a narrower folder or add excludes.`);
    }
    for (const ent of entries) {
      if (isSkippedName(ent.name)) continue;
      const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
      // Symlinked directories are not followed (loops, and escaping the root).
      if (ent.isDirectory()) {
        if (recursive && !matchesPattern(patterns, rel, true)) queue.push(rel);
        continue;
      }
      if (!isDocName(ent.name) || !(ent.isFile() || ent.isSymbolicLink())) continue;
      if (matchesPattern(patterns, rel, false)) continue;
      let st: fs.Stats;
      try {
        st = await fsp.stat(path.join(absDir, ent.name));
      } catch {
        continue; // dangling symlink, or deleted mid-walk
      }
      if (!st.isFile()) continue;
      files.set(rel, { size: st.size, mtimeMs: st.mtimeMs });
      if (files.size > MAX_FILES) {
        throw new SourceError(`More than ${MAX_FILES.toLocaleString()} documents — link a narrower folder or add excludes.`);
      }
    }
  }
  return { files, dirs };
}

function hashFile(abs: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(abs)
      .on('error', reject)
      .on('data', chunk => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

async function hasPdfTrailer(abs: string, size: number): Promise<boolean> {
  const len = Math.min(size, 2048);
  if (len === 0) return false;
  try {
    const fh = await fsp.open(abs, 'r');
    try {
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, size - len);
      return buf.includes('%%EOF');
    } finally {
      await fh.close();
    }
  } catch {
    return false;
  }
}

/** Whether a new or changed file looks finished being written. */
async function isSettled(abs: string, file: DiskFile, now: number): Promise<boolean> {
  const age = now - file.mtimeMs;
  if (age < SETTLE_MS) return false;
  if (path.extname(abs).toLowerCase() !== '.pdf' || age >= SETTLE_BROKEN_MS) return true;
  return hasPdfTrailer(abs, file.size);
}

function unlinkQuietly(files: string[]) {
  for (const f of files) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* already gone */
    }
  }
}

// --- Scanning --------------------------------------------------------------

const inFlight = new Map<string, Promise<ScanSummary>>();
const rerunRequested = new Set<string>();
const lastScanFinished = new Map<string, number>();

function emptySummary(): ScanSummary {
  return { added: 0, updated: 0, moved: 0, adopted: 0, missing: 0, removed: 0, offline: false };
}

function summaryChanged(s: ScanSummary): boolean {
  return s.added + s.updated + s.moved + s.adopted + s.missing + s.removed > 0;
}

/** Scan one source. Concurrent requests join the running scan and queue one re-run after it. */
export function scanSource(id: string, opts: ScanOptions = {}): Promise<ScanSummary> {
  const running = inFlight.get(id);
  if (running) {
    rerunRequested.add(id);
    return running;
  }
  const p = (async () => {
    try {
      return await doScan(id, opts);
    } finally {
      inFlight.delete(id);
      lastScanFinished.set(id, Date.now());
      if (rerunRequested.delete(id)) scanSource(id).catch(err => logScanError(id, err));
    }
  })();
  inFlight.set(id, p);
  return p;
}

/** Scan after a settings change: wait out any scan that started with the old settings. */
async function rescanAfterChange(id: string): Promise<ScanSummary> {
  await inFlight.get(id)?.catch(() => {});
  return scanSource(id);
}

export async function scanAllSources(): Promise<boolean> {
  let changed = false;
  for (const s of listSourceRows()) {
    const last = lastScanFinished.get(s.id) ?? 0;
    if (!inFlight.has(s.id) && Date.now() - last < SCAN_ALL_MIN_INTERVAL_MS) continue;
    try {
      const summary = await scanSource(s.id);
      if (summaryChanged(summary)) changed = true;
    } catch (err) {
      logScanError(s.id, err);
    }
  }
  return changed;
}

function logScanError(id: string, err: unknown) {
  console.error(`[sources] scan of ${id} failed:`, err);
}

function setSourceState(src: SourceRow, state: { offline: boolean; error: string | null }) {
  const offlineSince = state.offline ? (src.offline_since ?? new Date().toISOString()) : null;
  db.prepare('UPDATE sources SET offline_since = ?, error = ? WHERE id = ?').run(offlineSince, state.error, src.id);
  if (!!src.offline_since !== state.offline || src.error !== state.error) {
    sourceEvents.emit('changed', { sourceId: src.id });
  }
}

async function doScan(id: string, opts: ScanOptions): Promise<ScanSummary> {
  const summary = emptySummary();
  const src = getSourceRow(id);
  if (!src) return summary;

  // An unreachable root (unmounted drive, renamed folder) leaves every item alone.
  try {
    if (!(await fsp.stat(src.root_path)).isDirectory()) throw new Error('not a directory');
  } catch {
    unwatch(id);
    setSourceState(src, { offline: true, error: null });
    summary.offline = true;
    return summary;
  }

  let walked: WalkResult;
  try {
    walked = await walk(src.root_path, src.recursive === 1, compilePatterns(parseExclude(src.exclude)));
  } catch (err) {
    setSourceState(src, { offline: false, error: err instanceof Error ? err.message : String(err) });
    return summary;
  }

  const existing = db.prepare(`
    SELECT id, rel_path, size, mtime_ms, sha256, missing_at, thumbnail_path
    FROM attachments WHERE source_id = ?
  `).all(id) as LinkedRow[];

  // A completely empty root that used to have files is far more likely an
  // unmounted mount point than a deliberate wipe: treat it as offline.
  if (
    walked.files.size === 0
    && existing.some(r => !r.missing_at)
    && (await fsp.readdir(src.root_path).catch(() => [])).length === 0
  ) {
    unwatch(id);
    setSourceState(src, { offline: true, error: null });
    summary.offline = true;
    return summary;
  }
  syncWatchers(id, walked.dirs);

  const now = Date.now();
  const byPath = new Map(existing.map(r => [r.rel_path, r]));
  const seen = new Set<string>();
  const changed: Array<{ row: LinkedRow; file: DiskFile; sha: string }> = [];
  const fresh: Array<{ rel: string; file: DiskFile; sha: string }> = [];
  let unsettled = false;

  for (const [rel, file] of walked.files) {
    const row = byPath.get(rel);
    if (row) seen.add(row.id);
    const same = !!row && row.size === file.size && row.mtime_ms === file.mtimeMs;
    if (same && !row.missing_at) continue;
    const abs = path.join(src.root_path, rel);
    if (!same && !(await isSettled(abs, file, now))) {
      unsettled = true;
      continue;
    }
    let sha: string;
    try {
      sha = same && row.sha256 ? row.sha256 : await hashFile(abs);
    } catch {
      continue; // vanished or unreadable since the walk; the next scan will see
    }
    if (row) changed.push({ row, file, sha });
    else fresh.push({ rel, file, sha });
  }

  const thumbnailsToDelete: string[] = [];
  const managedCopiesToDelete: string[] = [];
  const nowIso = new Date().toISOString();

  db.transaction(() => {
    // Settings may have changed while we were hashing; apply the current ones.
    const cur = getSourceRow(id);
    if (!cur) return;
    const patterns = compilePatterns(parseExclude(cur.exclude));
    const recursive = cur.recursive === 1;
    const out = (rel: string) => isOutOfScope(rel, recursive, patterns);

    for (const { row, file, sha } of changed) {
      const contentChanged = sha !== row.sha256;
      // New content → re-read page count, metadata and cover.
      db.prepare(`
        UPDATE attachments SET size = ?, mtime_ms = ?, sha256 = ?, missing_at = NULL
          ${contentChanged ? ', enriched_at = NULL' : ''}
        WHERE id = ?
      `).run(file.size, file.mtimeMs, sha, row.id);
      summary.updated++;
    }

    const vanished = existing.filter(r => !seen.has(r.id));
    const vanishedBySha = new Map<string, LinkedRow[]>();
    for (const r of vanished) {
      if (!r.sha256) continue;
      const list = vanishedBySha.get(r.sha256) ?? [];
      list.push(r);
      vanishedBySha.set(r.sha256, list);
    }
    const movedIds = new Set<string>();
    const adoptIds = opts.adoptIds ?? new Set<string>();
    const findAdoptable = db.prepare(
      'SELECT id, file_path FROM attachments WHERE sha256 = ? AND source_id IS NULL',
    );

    for (const f of fresh) {
      if (out(f.rel)) continue;
      const filename = path.posix.basename(f.rel);
      const moved = vanishedBySha.get(f.sha)?.shift();
      if (moved) {
        db.prepare(`
          UPDATE attachments SET rel_path = ?, filename = ?, size = ?, mtime_ms = ?, missing_at = NULL
          WHERE id = ?
        `).run(f.rel, filename, f.file.size, f.file.mtimeMs, moved.id);
        movedIds.add(moved.id);
        summary.moved++;
        continue;
      }
      const adoptee = adoptIds.size > 0
        ? (findAdoptable.all(f.sha) as Array<{ id: string; file_path: string }>).find(r => adoptIds.has(r.id))
        : undefined;
      if (adoptee) {
        // The uploaded copy becomes this linked file; its annotations, tags and
        // projects stay attached to the same id.
        db.prepare(`
          UPDATE attachments SET source_id = ?, rel_path = ?, filename = ?, size = ?, mtime_ms = ?,
            file_path = '', missing_at = NULL
          WHERE id = ?
        `).run(id, f.rel, filename, f.file.size, f.file.mtimeMs, adoptee.id);
        adoptIds.delete(adoptee.id);
        if (adoptee.file_path) managedCopiesToDelete.push(path.join(ATTACHMENTS_DIR, adoptee.file_path));
        summary.adopted++;
        continue;
      }
      const info = db.prepare(`
        INSERT OR IGNORE INTO attachments
          (id, subject, filename, type, size, file_path, sha256, created_at, kind, source_id, rel_path, mtime_ms)
        VALUES (?, '', ?, ?, ?, '', ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), filename, mimeTypeFor(filename), f.file.size, f.sha, nowIso, guessKind({ filename }), id, f.rel, f.file.mtimeMs);
      if (info.changes > 0) summary.added++;
    }

    for (const r of vanished) {
      if (movedIds.has(r.id)) continue;
      if (out(r.rel_path)) {
        // Excluded on purpose (pattern, "Remove from library", subfolders off).
        db.prepare('DELETE FROM attachments WHERE id = ?').run(r.id);
        if (r.thumbnail_path) thumbnailsToDelete.push(path.join(THUMBNAILS_DIR, r.thumbnail_path));
        summary.removed++;
      } else if (!r.missing_at) {
        db.prepare('UPDATE attachments SET missing_at = ? WHERE id = ?').run(nowIso, r.id);
        summary.missing++;
      }
    }

    db.prepare('UPDATE sources SET last_scan_at = ?, offline_since = NULL, error = NULL WHERE id = ?').run(nowIso, id);
  })();

  unlinkQuietly([...thumbnailsToDelete, ...managedCopiesToDelete]);
  if (summaryChanged(summary) || src.offline_since || src.error) {
    sourceEvents.emit('changed', { sourceId: id });
  }
  if (unsettled) scheduleScan(id, SETTLE_MS + 500);
  return summary;
}

// --- Watching --------------------------------------------------------------
// One non-recursive fs.watch per visited directory, so excluded and hidden
// trees (.git, .lake, build output) cost no inotify watches. Events only
// schedule a debounced scan.

const watchers = new Map<string, Map<string, fs.FSWatcher>>();
const scanTimers = new Map<string, NodeJS.Timeout>();

function scheduleScan(id: string, delayMs = WATCH_DEBOUNCE_MS) {
  clearTimeout(scanTimers.get(id));
  scanTimers.set(id, setTimeout(() => {
    scanTimers.delete(id);
    scanSource(id).catch(err => logScanError(id, err));
  }, delayMs));
}

/** Documents, and extension-less names (possibly directories); ignore the rest of a build's churn. */
function isRelevantChange(filename: string | Buffer | null): boolean {
  if (!filename) return true;
  const name = filename.toString();
  if (isSkippedName(name)) return false;
  const ext = path.extname(name);
  return !ext || DOC_EXTENSIONS.has(ext.toLowerCase());
}

function syncWatchers(id: string, dirs: string[]) {
  let map = watchers.get(id);
  if (!map) {
    map = new Map();
    watchers.set(id, map);
  }
  const want = new Set(dirs);
  for (const [dir, w] of map) {
    if (!want.has(dir)) {
      w.close();
      map.delete(dir);
    }
  }
  for (const dir of want) {
    if (map.has(dir)) continue;
    try {
      const w = fs.watch(dir, { persistent: false }, (_event, filename) => {
        if (isRelevantChange(filename)) scheduleScan(id);
      });
      w.on('error', () => {
        w.close();
        map.delete(dir);
        scheduleScan(id);
      });
      map.set(dir, w);
    } catch (err) {
      // e.g. ENOSPC (inotify limit): scans on Library open still catch up.
      console.warn(`[sources] cannot watch ${dir}:`, err instanceof Error ? err.message : err);
    }
  }
}

function unwatch(id: string) {
  for (const w of watchers.get(id)?.values() ?? []) w.close();
  watchers.delete(id);
  clearTimeout(scanTimers.get(id));
  scanTimers.delete(id);
}

/** Initial scan (which also starts the watchers) for every linked folder. */
export async function startSources() {
  for (const s of listSourceRows()) {
    try {
      const summary = await scanSource(s.id);
      if (summaryChanged(summary)) {
        console.log(`[sources] ${s.name}: +${summary.added} ~${summary.updated} →${summary.moved} ?${summary.missing} -${summary.removed}`);
      }
    } catch (err) {
      logScanError(s.id, err);
    }
  }
}

// --- Mutations -------------------------------------------------------------

export interface SourceSettings {
  path: string;
  recursive: boolean;
  exclude: string[];
}

/** Dry run for the link/edit dialog: what would be taken in, adopted, or dropped. */
export async function previewSource(settings: SourceSettings, sourceId?: string) {
  const root = resolveRoot(settings.path, sourceId);
  const patterns = compilePatterns(settings.exclude);
  const walked = await walk(root, settings.recursive, patterns);
  const rels = [...walked.files.keys()].sort((a, b) => a.localeCompare(b));

  // Uploads with the same content: compare sizes first so only likely matches are hashed.
  const matches: Array<{ relPath: string; attachmentId: string; title: string }> = [];
  if (!sourceId) {
    const uploads = db.prepare(`
      SELECT id, size, sha256, filename, title FROM attachments
      WHERE source_id IS NULL AND sha256 IS NOT NULL
    `).all() as Array<{ id: string; size: number; sha256: string; filename: string; title: string | null }>;
    const bySize = new Map<number, typeof uploads>();
    for (const u of uploads) bySize.set(u.size, [...(bySize.get(u.size) ?? []), u]);
    const used = new Set<string>();
    for (const rel of rels) {
      const candidates = bySize.get(walked.files.get(rel)!.size)?.filter(u => !used.has(u.id));
      if (!candidates?.length) continue;
      let sha: string;
      try {
        sha = await hashFile(path.join(root, rel));
      } catch {
        continue;
      }
      const hit = candidates.find(u => u.sha256 === sha);
      if (hit) {
        used.add(hit.id);
        matches.push({ relPath: rel, attachmentId: hit.id, title: hit.title || hit.filename });
      }
    }
  }

  // Editing: linked items the new settings would drop from the library.
  const removals = { count: 0, withHighlights: 0 };
  if (sourceId) {
    const rows = db.prepare(`
      SELECT a.rel_path, (SELECT COUNT(*) FROM highlights h WHERE h.attachment_id = a.id) AS highlights
      FROM attachments a WHERE a.source_id = ?
    `).all(sourceId) as Array<{ rel_path: string; highlights: number }>;
    for (const r of rows) {
      if (!isOutOfScope(r.rel_path, settings.recursive, patterns)) continue;
      removals.count++;
      if (r.highlights > 0) removals.withHighlights++;
    }
  }

  return {
    path: tildify(root),
    total: rels.length,
    files: rels.slice(0, PREVIEW_LIST_LIMIT).map(rel => ({ relPath: rel, size: walked.files.get(rel)!.size })),
    matches,
    removals,
  };
}

export async function createSource(input: SourceSettings & { name?: string; adoptIds?: string[] }) {
  const root = resolveRoot(input.path);
  const id = uuidv4();
  const name = input.name?.trim() || path.basename(root);
  db.prepare(`
    INSERT INTO sources (id, name, root_path, recursive, exclude, created_at) VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, root, input.recursive ? 1 : 0, JSON.stringify(input.exclude), new Date().toISOString());
  const summary = await scanSource(id, { adoptIds: new Set(input.adoptIds ?? []) });
  return { id, summary };
}

export async function updateSource(id: string, patch: Partial<SourceSettings> & { name?: string }) {
  const src = getSourceRow(id);
  if (!src) throw new SourceError('Linked folder not found.');
  const root = patch.path !== undefined ? resolveRoot(patch.path, id) : src.root_path;
  db.prepare('UPDATE sources SET name = ?, root_path = ?, recursive = ?, exclude = ? WHERE id = ?').run(
    patch.name?.trim() || src.name,
    root,
    patch.recursive === undefined ? src.recursive : patch.recursive ? 1 : 0,
    patch.exclude === undefined ? src.exclude : JSON.stringify(patch.exclude),
    id,
  );
  sourceEvents.emit('changed', { sourceId: id });
  return rescanAfterChange(id);
}

function deleteAttachments(where: string, ...params: unknown[]): number {
  const rows = db.prepare(`SELECT thumbnail_path FROM attachments WHERE ${where}`).all(...params) as Array<{ thumbnail_path: string | null }>;
  const n = db.prepare(`DELETE FROM attachments WHERE ${where}`).run(...params).changes;
  unlinkQuietly(rows.filter(r => r.thumbnail_path).map(r => path.join(THUMBNAILS_DIR, r.thumbnail_path!)));
  return n;
}

/** Unlink a folder: its items leave the library; files on disk are untouched. */
export function deleteSource(id: string) {
  unwatch(id);
  db.transaction(() => {
    deleteAttachments('source_id = ?', id);
    db.prepare('DELETE FROM sources WHERE id = ?').run(id);
  })();
  sourceEvents.emit('changed', { sourceId: id });
}

export function removeMissing(id: string): number {
  const n = deleteAttachments('source_id = ? AND missing_at IS NOT NULL', id);
  if (n > 0) sourceEvents.emit('changed', { sourceId: id });
  return n;
}

/**
 * "Remove from library" for a linked item. A file still on disk is added to
 * the folder's excludes so the next scan does not bring it back; the file
 * itself is never touched.
 */
export function removeLinkedAttachment(row: { id: string; source_id: string; rel_path: string | null; file_path: string }) {
  const src = getSourceRow(row.source_id);
  const abs = attachmentFilePath(row);
  db.transaction(() => {
    if (src && row.rel_path && abs && fs.existsSync(abs)) {
      const exclude = parseExclude(src.exclude);
      const pattern = exactPattern(row.rel_path);
      if (!exclude.includes(pattern)) {
        db.prepare('UPDATE sources SET exclude = ? WHERE id = ?').run(JSON.stringify([...exclude, pattern]), src.id);
      }
    }
    deleteAttachments('id = ?', row.id);
  })();
}

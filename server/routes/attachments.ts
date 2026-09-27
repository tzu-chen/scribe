import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, ATTACHMENTS_DIR, THUMBNAILS_DIR } from '../db.ts';
import { guessKind, isAttachmentKind, type AttachmentKind } from '../lib/kindGuess.ts';

const router = Router();

const upload = multer({ dest: ATTACHMENTS_DIR });

// Build an RFC 6266 Content-Disposition value. Node's HTTP layer rejects header
// values containing any character outside Latin-1 (> 0xFF), so a filename with a
// curly apostrophe (’ U+2019), em dash, or other typographic character — common
// in copied paper titles — would otherwise crash the response. We emit an ASCII
// fallback plus an RFC 5987 UTF-8 encoded form so all clients get the real name.
function contentDisposition(filename: string): string {
  const asciiFallback = filename
    .replace(/[^\x20-\x7e]/g, '_') // strip non-ASCII (incl. control chars)
    .replace(/["\\]/g, '\\$&'); // escape backslash and double-quote
  const encoded = encodeURIComponent(filename)
    // Percent-encode chars encodeURIComponent leaves raw but RFC 5987 disallows.
    .replace(/['()*!]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

interface AttachmentRow {
  id: string;
  subject: string;
  filename: string;
  type: string;
  size: number;
  file_path: string;
  created_at: string;
  last_opened_at: string | null;
  folder_id: string | null;
  kind: string | null;
  kind_manual: number;
  title: string | null;
  authors: string | null;
  year: number | null;
  page_count: number | null;
  status: string | null;
  thumbnail_path: string | null;
  enriched_at: string | null;
  /** From the LEFT JOIN on viewer_prefs; absent on rows fetched without it. */
  current_page?: number | null;
}

// Every list/detail query goes through this so the derived `current_page`
// (reading progress) is always present.
const SELECT_WITH_PROGRESS = `
  SELECT a.*, vp.current_page
  FROM attachments a
  LEFT JOIN viewer_prefs vp ON vp.attachment_id = a.id
`;

function loadTagsMap(attachmentIds: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (attachmentIds.length === 0) return map;
  const placeholders = attachmentIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT attachment_id, tag_id FROM attachment_tags WHERE attachment_id IN (${placeholders})`)
    .all(...attachmentIds) as Array<{ attachment_id: string; tag_id: string }>;
  for (const row of rows) {
    const list = map.get(row.attachment_id) ?? [];
    list.push(row.tag_id);
    map.set(row.attachment_id, list);
  }
  return map;
}

function loadFoldersMap(attachmentIds: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (attachmentIds.length === 0) return map;
  const placeholders = attachmentIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT attachment_id, folder_id FROM attachment_folders WHERE attachment_id IN (${placeholders})`)
    .all(...attachmentIds) as Array<{ attachment_id: string; folder_id: string }>;
  for (const row of rows) {
    const list = map.get(row.attachment_id) ?? [];
    list.push(row.folder_id);
    map.set(row.attachment_id, list);
  }
  return map;
}

interface NodeAttachmentLink {
  flowchartId: string;
  nodeKey: string;
  title: string;
  flowchartName: string;
}

function loadNodeAttachmentsMap(attachmentIds: string[]): Map<string, NodeAttachmentLink[]> {
  const map = new Map<string, NodeAttachmentLink[]>();
  if (attachmentIds.length === 0) return map;
  const placeholders = attachmentIds.map(() => '?').join(',');
  const rows = db
    .prepare(`
      SELECT an.attachment_id, an.flowchart_id, an.node_key, fn.title, f.name AS flowchart_name
      FROM attachment_nodes an
      LEFT JOIN flowchart_nodes fn ON fn.flowchart_id = an.flowchart_id AND fn.node_key = an.node_key
      LEFT JOIN flowcharts f ON f.id = an.flowchart_id
      WHERE an.attachment_id IN (${placeholders})
    `)
    .all(...attachmentIds) as Array<{
      attachment_id: string;
      flowchart_id: string;
      node_key: string;
      title: string | null;
      flowchart_name: string | null;
    }>;
  for (const row of rows) {
    const list = map.get(row.attachment_id) ?? [];
    list.push({
      flowchartId: row.flowchart_id,
      nodeKey: row.node_key,
      title: row.title ?? row.node_key,
      flowchartName: row.flowchart_name ?? '',
    });
    map.set(row.attachment_id, list);
  }
  return map;
}

function rowToMeta(
  row: AttachmentRow,
  tagIds: string[] = [],
  nodeAttachments: NodeAttachmentLink[] = [],
  folderIds: string[] = [],
) {
  return {
    id: row.id,
    subject: row.subject,
    filename: row.filename,
    type: row.type,
    size: row.size,
    createdAt: row.created_at,
    lastOpenedAt: row.last_opened_at ?? undefined,
    folderIds,
    tags: tagIds,
    nodeAttachments,
    kind: isAttachmentKind(row.kind) ? row.kind : undefined,
    kindManual: row.kind_manual === 1,
    title: row.title ?? undefined,
    authors: row.authors ?? undefined,
    year: row.year ?? undefined,
    pageCount: row.page_count ?? undefined,
    status: row.status === 'done' ? ('done' as const) : undefined,
    currentPage: row.current_page ?? undefined,
    hasThumbnail: !!row.thumbnail_path,
    enrichedAt: row.enriched_at ?? undefined,
  };
}

/** Hydrate rows with their tag, node and project relations in three batched queries. */
function rowsToMeta(rows: AttachmentRow[]) {
  const ids = rows.map(r => r.id);
  const tagsMap = loadTagsMap(ids);
  const nodesMap = loadNodeAttachmentsMap(ids);
  const foldersMap = loadFoldersMap(ids);
  return rows.map(r => rowToMeta(r, tagsMap.get(r.id) ?? [], nodesMap.get(r.id) ?? [], foldersMap.get(r.id) ?? []));
}

function getRow(id: string): AttachmentRow | undefined {
  return db.prepare(`${SELECT_WITH_PROGRESS} WHERE a.id = ?`).get(id) as AttachmentRow | undefined;
}

function thumbnailFile(id: string): string {
  return path.join(THUMBNAILS_DIR, `${id}.jpg`);
}

// GET /api/attachments
router.get('/', (_req, res) => {
  const rows = db.prepare(`${SELECT_WITH_PROGRESS} ORDER BY a.created_at DESC`).all() as AttachmentRow[];
  res.json(rowsToMeta(rows));
});

// GET /api/attachments/by-node?flowchartId=X&nodeKey=Y
router.get('/by-node', (req, res) => {
  const flowchartId = req.query.flowchartId as string;
  const nodeKey = req.query.nodeKey as string;
  if (!flowchartId || !nodeKey) {
    res.status(400).json({ error: 'flowchartId and nodeKey are required' });
    return;
  }
  const rows = db.prepare(`
    ${SELECT_WITH_PROGRESS}
    JOIN attachment_nodes an ON an.attachment_id = a.id
    WHERE an.flowchart_id = ? AND an.node_key = ?
    ORDER BY a.created_at DESC
  `).all(flowchartId, nodeKey) as AttachmentRow[];
  res.json(rowsToMeta(rows));
});

// GET /api/attachments/counts-by-node?flowchartId=X
// Returns counts keyed by node_key (stable across renames, unlike titles).
router.get('/counts-by-node', (req, res) => {
  const flowchartId = req.query.flowchartId as string | undefined;
  let rows: Array<{ node_key: string; count: number }>;
  if (flowchartId) {
    rows = db.prepare(
      'SELECT node_key, COUNT(*) as count FROM attachment_nodes WHERE flowchart_id = ? GROUP BY node_key'
    ).all(flowchartId) as Array<{ node_key: string; count: number }>;
  } else {
    rows = db.prepare(
      'SELECT node_key, COUNT(*) as count FROM attachment_nodes GROUP BY node_key'
    ).all() as Array<{ node_key: string; count: number }>;
  }
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.node_key] = row.count;
  }
  res.json(counts);
});

// POST /api/attachments (multipart upload)
router.post('/', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  // Hash the upload before persisting so we can reject duplicates.
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');
  const existing = db.prepare(
    `${SELECT_WITH_PROGRESS} WHERE a.sha256 = ? LIMIT 1`
  ).get(sha256) as AttachmentRow | undefined;
  if (existing) {
    fs.unlinkSync(file.path);
    res.status(409).json({
      error: 'Duplicate file',
      duplicate: rowsToMeta([existing])[0],
    });
    return;
  }

  const id = uuidv4();
  const ext = path.extname(file.originalname);
  const storedFilename = `${id}${ext}`;
  const storedPath = path.join(ATTACHMENTS_DIR, storedFilename);

  // multer saved the file with a random name; rename it
  fs.renameSync(file.path, storedPath);

  // Browsers often report DjVu files as application/octet-stream; detect by extension
  let mimeType = file.mimetype;
  if (file.originalname.toLowerCase().endsWith('.djvu') && mimeType === 'application/octet-stream') {
    mimeType = 'image/vnd.djvu';
  }

  const subject = (req.body.subject as string) ?? '';
  const folderId = (req.body.folder_id as string) || null;
  const now = new Date().toISOString();
  const kind = guessKind({ filename: file.originalname });

  const insert = db.transaction(() => {
    db.prepare(`
      INSERT INTO attachments (id, subject, filename, type, size, file_path, sha256, created_at, kind)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, subject, file.originalname, mimeType, file.size, storedFilename, sha256, now, kind);
    if (folderId) {
      db.prepare('INSERT OR IGNORE INTO attachment_folders (attachment_id, folder_id) VALUES (?, ?)').run(id, folderId);
    }
  });
  insert();

  const row = getRow(id)!;
  res.json(rowsToMeta([row])[0]);
});

// GET /api/attachments/:id — single record with relations
router.get('/:id', (req, res) => {
  const row = getRow(req.params.id);
  if (!row) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }
  res.json(rowsToMeta([row])[0]);
});

// GET /api/attachments/:id/blob
router.get('/:id/blob', (req, res) => {
  const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id) as AttachmentRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  const filePath = path.join(ATTACHMENTS_DIR, row.file_path);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found on disk' });
    return;
  }

  res.setHeader('Content-Type', row.type);
  res.setHeader('Content-Length', row.size);
  res.setHeader('Content-Disposition', contentDisposition(row.filename));
  fs.createReadStream(filePath).pipe(res);
});

// GET /api/attachments/:id/thumbnail — first-page JPEG, if enriched
router.get('/:id/thumbnail', (req, res) => {
  const row = db.prepare('SELECT thumbnail_path FROM attachments WHERE id = ?').get(req.params.id) as
    | { thumbnail_path: string | null }
    | undefined;
  if (!row?.thumbnail_path) {
    res.status(404).end();
    return;
  }
  const filePath = path.join(THUMBNAILS_DIR, row.thumbnail_path);
  if (!fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }
  // The client appends ?v=<enrichedAt>, so a long cache lifetime is safe.
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  fs.createReadStream(filePath).pipe(res);
});

// PUT /api/attachments/:id/enrichment
// Body: { pageCount?, title?, authors?, year?, creator?, producer?, thumbnail?: "data:image/jpeg;base64,..." }
// Written by the client after it has parsed the PDF (the browser already has
// pdf.js; the server does not). Re-runs the kind guess unless the kind was set
// by hand.
router.put('/:id/enrichment', (req, res) => {
  const id = req.params.id;
  const row = getRow(id);
  if (!row) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null);
  const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

  const pageCount = int(body.pageCount);
  const title = str(body.title);
  const authors = str(body.authors);
  const year = int(body.year);
  const creator = str(body.creator);
  const producer = str(body.producer);

  let thumbnailPath: string | null = row.thumbnail_path;
  if (typeof body.thumbnail === 'string') {
    const m = /^data:image\/jpeg;base64,(.+)$/.exec(body.thumbnail);
    if (!m) {
      res.status(400).json({ error: 'thumbnail must be a JPEG data URL' });
      return;
    }
    fs.writeFileSync(thumbnailFile(id), Buffer.from(m[1], 'base64'));
    thumbnailPath = `${id}.jpg`;
  }

  let kind: string | null = row.kind;
  if (row.kind_manual !== 1) {
    kind = guessKind({
      filename: row.filename,
      pageCount: pageCount ?? row.page_count,
      title: title ?? row.title,
      authors: authors ?? row.authors,
      creator,
      producer,
    });
  }

  db.prepare(`
    UPDATE attachments SET
      page_count = COALESCE(?, page_count),
      title = COALESCE(?, title),
      authors = COALESCE(?, authors),
      year = COALESCE(?, year),
      thumbnail_path = ?,
      kind = ?,
      enriched_at = ?
    WHERE id = ?
  `).run(pageCount, title, authors, year, thumbnailPath, kind, new Date().toISOString(), id);

  res.json(rowsToMeta([getRow(id)!])[0]);
});

// PATCH /api/attachments/:id/kind — { kind: AttachmentKind | null }
// A kind chosen by hand sticks; null resets to automatic guessing.
router.patch('/:id/kind', (req, res) => {
  const { kind } = (req.body ?? {}) as { kind?: unknown };
  const row = getRow(req.params.id);
  if (!row) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }
  if (kind === null) {
    const guessed = guessKind({
      filename: row.filename,
      pageCount: row.page_count,
      title: row.title,
      authors: row.authors,
    });
    db.prepare('UPDATE attachments SET kind = ?, kind_manual = 0 WHERE id = ?').run(guessed, row.id);
  } else if (isAttachmentKind(kind)) {
    db.prepare('UPDATE attachments SET kind = ?, kind_manual = 1 WHERE id = ?').run(kind satisfies AttachmentKind, row.id);
  } else {
    res.status(400).json({ error: 'kind must be one of book, paper, draft, notes, other, or null' });
    return;
  }
  res.json(rowsToMeta([getRow(row.id)!])[0]);
});

// PATCH /api/attachments/:id/status — { status: 'done' | null }
router.patch('/:id/status', (req, res) => {
  const { status } = (req.body ?? {}) as { status?: unknown };
  if (status !== null && status !== 'done') {
    res.status(400).json({ error: "status must be 'done' or null" });
    return;
  }
  db.prepare('UPDATE attachments SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

// PATCH /api/attachments/:id/subject
router.patch('/:id/subject', (req, res) => {
  const { subject } = req.body;
  db.prepare('UPDATE attachments SET subject = ? WHERE id = ?').run(subject, req.params.id);
  res.json({ ok: true });
});

// GET /api/attachments/:id/nodes — list the flowchart nodes this attachment is in
router.get('/:id/nodes', (req, res) => {
  const nodes = loadNodeAttachmentsMap([req.params.id]).get(req.params.id) ?? [];
  res.json(nodes);
});

// POST /api/attachments/:id/nodes — attach to a flowchart node (additive)
router.post('/:id/nodes', (req, res) => {
  const { flowchartId, nodeKey } = req.body ?? {};
  if (typeof flowchartId !== 'string' || typeof nodeKey !== 'string' || !flowchartId || !nodeKey) {
    res.status(400).json({ error: 'flowchartId and nodeKey are required' });
    return;
  }
  const attachmentId = req.params.id;
  const existing = db.prepare('SELECT id FROM attachments WHERE id = ?').get(attachmentId);
  if (!existing) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }
  db.prepare(
    'INSERT OR IGNORE INTO attachment_nodes (attachment_id, flowchart_id, node_key) VALUES (?, ?, ?)'
  ).run(attachmentId, flowchartId, nodeKey);
  res.json({ ok: true });
});

// DELETE /api/attachments/:id/nodes/:flowchartId/:nodeKey — detach from one node
router.delete('/:id/nodes/:flowchartId/:nodeKey', (req, res) => {
  db.prepare(
    'DELETE FROM attachment_nodes WHERE attachment_id = ? AND flowchart_id = ? AND node_key = ?'
  ).run(req.params.id, req.params.flowchartId, req.params.nodeKey);
  res.status(204).end();
});

// PATCH /api/attachments/:id/filename
router.patch('/:id/filename', (req, res) => {
  const { filename } = req.body;
  if (!filename || typeof filename !== 'string') {
    res.status(400).json({ error: 'filename is required' });
    return;
  }
  db.prepare('UPDATE attachments SET filename = ? WHERE id = ?').run(filename.trim(), req.params.id);
  res.json({ ok: true });
});

// PATCH /api/attachments/:id/title — { title } display title override ('' clears it)
router.patch('/:id/title', (req, res) => {
  const { title } = req.body ?? {};
  if (typeof title !== 'string') {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  db.prepare('UPDATE attachments SET title = ? WHERE id = ?').run(title.trim() || null, req.params.id);
  res.json({ ok: true });
});

// PATCH /api/attachments/:id/last-opened
router.patch('/:id/last-opened', (req, res) => {
  const now = new Date().toISOString();
  db.prepare('UPDATE attachments SET last_opened_at = ? WHERE id = ?').run(now, req.params.id);
  res.json({ ok: true });
});

// PUT /api/attachments/:id/tags — replace the set of tags on an attachment
router.put('/:id/tags', (req, res) => {
  const { tagIds } = req.body;
  if (!Array.isArray(tagIds) || tagIds.some(id => typeof id !== 'string')) {
    res.status(400).json({ error: 'tagIds must be an array of strings' });
    return;
  }
  const attachmentId = req.params.id;
  const existing = db.prepare('SELECT id FROM attachments WHERE id = ?').get(attachmentId);
  if (!existing) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }
  const txn = db.transaction((ids: string[]) => {
    db.prepare('DELETE FROM attachment_tags WHERE attachment_id = ?').run(attachmentId);
    const insert = db.prepare('INSERT OR IGNORE INTO attachment_tags (attachment_id, tag_id) VALUES (?, ?)');
    for (const tagId of ids) {
      insert.run(attachmentId, tagId);
    }
  });
  txn(tagIds);
  res.json({ ok: true });
});

// PUT /api/attachments/:id/folders — replace the set of projects (folders) on an attachment
router.put('/:id/folders', (req, res) => {
  const { folderIds } = req.body ?? {};
  if (!Array.isArray(folderIds) || folderIds.some(id => typeof id !== 'string')) {
    res.status(400).json({ error: 'folderIds must be an array of strings' });
    return;
  }
  const attachmentId = req.params.id;
  const existing = db.prepare('SELECT id FROM attachments WHERE id = ?').get(attachmentId);
  if (!existing) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }
  const txn = db.transaction((ids: string[]) => {
    db.prepare('DELETE FROM attachment_folders WHERE attachment_id = ?').run(attachmentId);
    const insert = db.prepare('INSERT OR IGNORE INTO attachment_folders (attachment_id, folder_id) VALUES (?, ?)');
    for (const folderId of ids) {
      insert.run(attachmentId, folderId);
    }
  });
  txn(folderIds);
  res.json({ ok: true });
});

// DELETE /api/attachments/:id
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT file_path, thumbnail_path FROM attachments WHERE id = ?').get(req.params.id) as
    | { file_path: string; thumbnail_path: string | null }
    | undefined;

  // Delete from DB (cascading deletes will remove highlights, comments, links)
  db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);

  // Delete file + thumbnail from disk
  if (row) {
    const filePath = path.join(ATTACHMENTS_DIR, row.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (row.thumbnail_path) {
      const thumbPath = path.join(THUMBNAILS_DIR, row.thumbnail_path);
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
    }
  }

  res.status(204).end();
});

export default router;

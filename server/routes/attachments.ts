import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, ATTACHMENTS_DIR } from '../db.ts';

const router = Router();

const upload = multer({ dest: ATTACHMENTS_DIR });

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
}

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

function rowToMeta(row: AttachmentRow, tagIds: string[] = [], nodeAttachments: NodeAttachmentLink[] = []) {
  return {
    id: row.id,
    subject: row.subject,
    filename: row.filename,
    type: row.type,
    size: row.size,
    createdAt: row.created_at,
    lastOpenedAt: row.last_opened_at ?? undefined,
    folderId: row.folder_id ?? undefined,
    tags: tagIds,
    nodeAttachments,
  };
}

// GET /api/attachments
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM attachments ORDER BY created_at DESC').all() as AttachmentRow[];
  const ids = rows.map(r => r.id);
  const tagsMap = loadTagsMap(ids);
  const nodesMap = loadNodeAttachmentsMap(ids);
  res.json(rows.map(r => rowToMeta(r, tagsMap.get(r.id) ?? [], nodesMap.get(r.id) ?? [])));
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
    SELECT a.* FROM attachments a
    JOIN attachment_nodes an ON an.attachment_id = a.id
    WHERE an.flowchart_id = ? AND an.node_key = ?
    ORDER BY a.created_at DESC
  `).all(flowchartId, nodeKey) as AttachmentRow[];
  const ids = rows.map(r => r.id);
  const tagsMap = loadTagsMap(ids);
  const nodesMap = loadNodeAttachmentsMap(ids);
  res.json(rows.map(r => rowToMeta(r, tagsMap.get(r.id) ?? [], nodesMap.get(r.id) ?? [])));
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
    'SELECT * FROM attachments WHERE sha256 = ? LIMIT 1'
  ).get(sha256) as AttachmentRow | undefined;
  if (existing) {
    fs.unlinkSync(file.path);
    const tagIds = loadTagsMap([existing.id]).get(existing.id) ?? [];
    const nodes = loadNodeAttachmentsMap([existing.id]).get(existing.id) ?? [];
    res.status(409).json({
      error: 'Duplicate file',
      duplicate: rowToMeta(existing, tagIds, nodes),
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

  db.prepare(`
    INSERT INTO attachments (id, subject, filename, type, size, file_path, sha256, created_at, folder_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, subject, file.originalname, mimeType, file.size, storedFilename, sha256, now, folderId);

  res.json({
    id,
    subject,
    filename: file.originalname,
    type: mimeType,
    size: file.size,
    createdAt: now,
    folderId: folderId ?? undefined,
    tags: [],
  });
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
  res.setHeader('Content-Disposition', `inline; filename="${row.filename}"`);
  fs.createReadStream(filePath).pipe(res);
});

// PATCH /api/attachments/:id/subject
router.patch('/:id/subject', (req, res) => {
  const { subject } = req.body;
  db.prepare('UPDATE attachments SET subject = ? WHERE id = ?').run(subject, req.params.id);
  res.json({ ok: true });
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

// PATCH /api/attachments/:id/folder
router.patch('/:id/folder', (req, res) => {
  const { folderId } = req.body;
  db.prepare('UPDATE attachments SET folder_id = ? WHERE id = ?').run(folderId ?? null, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/attachments/:id
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT file_path FROM attachments WHERE id = ?').get(req.params.id) as { file_path: string } | undefined;

  // Delete from DB (cascading deletes will remove highlights & comments)
  db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);

  // Delete file from disk
  if (row) {
    const filePath = path.join(ATTACHMENTS_DIR, row.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  res.status(204).end();
});

export default router;

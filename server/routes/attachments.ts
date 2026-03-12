import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
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
}

function rowToMeta(row: AttachmentRow) {
  return {
    id: row.id,
    subject: row.subject,
    filename: row.filename,
    type: row.type,
    size: row.size,
    createdAt: row.created_at,
  };
}

// GET /api/attachments
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM attachments ORDER BY created_at DESC').all() as AttachmentRow[];
  res.json(rows.map(rowToMeta));
});

// GET /api/attachments/by-subject?subject=X
router.get('/by-subject', (req, res) => {
  const subject = req.query.subject as string;
  const rows = db.prepare('SELECT * FROM attachments WHERE subject = ?').all(subject) as AttachmentRow[];
  res.json(rows.map(rowToMeta));
});

// GET /api/attachments/counts-by-subject
router.get('/counts-by-subject', (_req, res) => {
  const rows = db.prepare('SELECT subject, COUNT(*) as count FROM attachments GROUP BY subject').all() as Array<{ subject: string; count: number }>;
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.subject] = row.count;
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

  const id = uuidv4();
  const ext = path.extname(file.originalname);
  const storedFilename = `${id}${ext}`;
  const storedPath = path.join(ATTACHMENTS_DIR, storedFilename);

  // multer saved the file with a random name; rename it
  fs.renameSync(file.path, storedPath);

  const subject = (req.body.subject as string) ?? '';
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO attachments (id, subject, filename, type, size, file_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, subject, file.originalname, file.mimetype, file.size, storedFilename, now);

  res.json({
    id,
    subject,
    filename: file.originalname,
    type: file.mimetype,
    size: file.size,
    createdAt: now,
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

import { Router } from 'express';
import { db } from '../db.ts';

const router = Router();

interface NoteRow {
  id: string;
  title: string;
  content: string;
  tags: string;
  status: string;
  category: string | null;
  subject: string | null;
  created_at: string;
  updated_at: string;
}

function rowToNote(row: NoteRow) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: JSON.parse(row.tags) as string[],
    status: row.status as 'draft' | 'published',
    category: row.category ?? undefined,
    subject: row.subject ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/notes
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM notes').all() as NoteRow[];
  res.json(rows.map(rowToNote));
});

// GET /api/notes/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id) as NoteRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }
  res.json(rowToNote(row));
});

// PUT /api/notes/:id (upsert)
router.put('/:id', (req, res) => {
  const note = req.body;
  const id = req.params.id;

  db.prepare(`
    INSERT INTO notes (id, title, content, tags, status, category, subject, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      tags = excluded.tags,
      status = excluded.status,
      category = excluded.category,
      subject = excluded.subject,
      updated_at = excluded.updated_at
  `).run(
    id,
    note.title ?? '',
    note.content ?? '',
    JSON.stringify(note.tags ?? []),
    note.status ?? 'draft',
    note.category ?? null,
    note.subject ?? null,
    note.createdAt ?? new Date().toISOString(),
    note.updatedAt ?? new Date().toISOString(),
  );

  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow;
  res.json(rowToNote(row));
});

// DELETE /api/notes/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;

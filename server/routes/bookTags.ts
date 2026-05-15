import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.ts';

const router = Router();

interface TagRow {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

function rowToTag(row: TagRow) {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? undefined,
    createdAt: row.created_at,
  };
}

// GET /api/book-tags
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM book_tags ORDER BY name COLLATE NOCASE ASC').all() as TagRow[];
  res.json(rows.map(rowToTag));
});

// POST /api/book-tags
router.post('/', (req, res) => {
  const { name, color } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const existing = db.prepare('SELECT * FROM book_tags WHERE name = ? COLLATE NOCASE').get(trimmed) as TagRow | undefined;
  if (existing) {
    res.json(rowToTag(existing));
    return;
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO book_tags (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    trimmed,
    typeof color === 'string' ? color : null,
    now,
  );
  res.json({ id, name: trimmed, color: typeof color === 'string' ? color : undefined, createdAt: now });
});

// PATCH /api/book-tags/:id
router.patch('/:id', (req, res) => {
  const { name, color } = req.body;
  if (typeof name === 'string') {
    const trimmed = name.trim();
    if (!trimmed) {
      res.status(400).json({ error: 'name cannot be empty' });
      return;
    }
    db.prepare('UPDATE book_tags SET name = ? WHERE id = ?').run(trimmed, req.params.id);
  }
  if (typeof color === 'string' || color === null) {
    db.prepare('UPDATE book_tags SET color = ? WHERE id = ?').run(color, req.params.id);
  }
  res.json({ ok: true });
});

// DELETE /api/book-tags/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM book_tags WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.ts';

// Folders are surfaced in the UI as "projects": non-exclusive groupings of
// attachments (see attachment_folders) that can be archived when finished.

const router = Router();

interface FolderRow {
  id: string;
  name: string;
  created_at: string;
  archived_at: string | null;
}

function rowToFolder(row: FolderRow) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    archivedAt: row.archived_at ?? undefined,
  };
}

// GET /api/folders
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM folders ORDER BY name ASC').all() as FolderRow[];
  res.json(rows.map(rowToFolder));
});

// POST /api/folders
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)').run(id, name.trim(), now);
  res.json({ id, name: name.trim(), createdAt: now });
});

// PATCH /api/folders/:id/name
router.patch('/:id/name', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  res.json({ ok: true });
});

// PATCH /api/folders/:id/archived — { archived: boolean }
router.patch('/:id/archived', (req, res) => {
  const { archived } = req.body ?? {};
  if (typeof archived !== 'boolean') {
    res.status(400).json({ error: 'archived must be a boolean' });
    return;
  }
  db.prepare('UPDATE folders SET archived_at = ? WHERE id = ?').run(
    archived ? new Date().toISOString() : null,
    req.params.id,
  );
  res.json({ ok: true });
});

// DELETE /api/folders/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM folders WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;

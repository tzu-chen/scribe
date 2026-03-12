import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.ts';

const router = Router();

interface HighlightRow {
  id: string;
  attachment_id: string;
  page_number: number;
  rects: string;
  selected_text: string;
  color: string;
  created_at: string;
}

interface CommentRow {
  id: string;
  highlight_id: string;
  attachment_id: string;
  text: string;
  created_at: string;
  updated_at: string;
}

function rowToHighlight(row: HighlightRow) {
  return {
    id: row.id,
    attachmentId: row.attachment_id,
    pageNumber: row.page_number,
    rects: JSON.parse(row.rects),
    selectedText: row.selected_text,
    color: row.color,
    createdAt: row.created_at,
  };
}

function rowToComment(row: CommentRow) {
  return {
    id: row.id,
    highlightId: row.highlight_id,
    attachmentId: row.attachment_id,
    text: row.text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Highlights ---

// GET /api/annotations/highlights?attachmentId=X
router.get('/highlights', (req, res) => {
  const attachmentId = req.query.attachmentId as string;
  const rows = db.prepare('SELECT * FROM highlights WHERE attachment_id = ?').all(attachmentId) as HighlightRow[];
  res.json(rows.map(rowToHighlight));
});

// POST /api/annotations/highlights
router.post('/highlights', (req, res) => {
  const { attachmentId, pageNumber, rects, selectedText, color } = req.body;
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO highlights (id, attachment_id, page_number, rects, selected_text, color, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, attachmentId, pageNumber, JSON.stringify(rects), selectedText ?? '', color ?? '#ffec99', now);

  res.json({
    id,
    attachmentId,
    pageNumber,
    rects,
    selectedText: selectedText ?? '',
    color: color ?? '#ffec99',
    createdAt: now,
  });
});

// DELETE /api/annotations/highlights/:id
router.delete('/highlights/:id', (req, res) => {
  // FK cascade will delete associated comments
  db.prepare('DELETE FROM highlights WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// --- Comments ---

// GET /api/annotations/comments?highlightId=X or ?attachmentId=X
router.get('/comments', (req, res) => {
  const { highlightId, attachmentId } = req.query;
  let rows: CommentRow[];

  if (highlightId) {
    rows = db.prepare('SELECT * FROM comments WHERE highlight_id = ?').all(highlightId as string) as CommentRow[];
  } else if (attachmentId) {
    rows = db.prepare('SELECT * FROM comments WHERE attachment_id = ?').all(attachmentId as string) as CommentRow[];
  } else {
    res.status(400).json({ error: 'highlightId or attachmentId query param required' });
    return;
  }

  res.json(rows.map(rowToComment));
});

// POST /api/annotations/comments
router.post('/comments', (req, res) => {
  const { highlightId, attachmentId, text } = req.body;
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO comments (id, highlight_id, attachment_id, text, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, highlightId, attachmentId, text ?? '', now, now);

  res.json({
    id,
    highlightId,
    attachmentId,
    text: text ?? '',
    createdAt: now,
    updatedAt: now,
  });
});

// PATCH /api/annotations/comments/:id
router.patch('/comments/:id', (req, res) => {
  const { text } = req.body;
  const now = new Date().toISOString();
  db.prepare('UPDATE comments SET text = ?, updated_at = ? WHERE id = ?').run(text, now, req.params.id);
  res.json({ ok: true });
});

// DELETE /api/annotations/comments/:id
router.delete('/comments/:id', (req, res) => {
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// DELETE /api/annotations/comments?highlightId=X
router.delete('/comments', (req, res) => {
  const highlightId = req.query.highlightId as string;
  if (!highlightId) {
    res.status(400).json({ error: 'highlightId query param required' });
    return;
  }
  db.prepare('DELETE FROM comments WHERE highlight_id = ?').run(highlightId);
  res.status(204).end();
});

export default router;

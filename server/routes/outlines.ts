import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.ts';

const router = Router();

interface OutlineRow {
  id: string;
  attachment_id: string;
  parent_id: string | null;
  title: string;
  page_number: number;
  dest_top: number | null;
  sort_order: number;
}

function rowToItem(row: OutlineRow) {
  return {
    id: row.id,
    attachmentId: row.attachment_id,
    parentId: row.parent_id,
    title: row.title,
    pageNumber: row.page_number,
    destTop: row.dest_top,
    sortOrder: row.sort_order,
  };
}

// GET /:attachmentId — get all custom outline items (flat list)
router.get('/:attachmentId', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM custom_outlines WHERE attachment_id = ? ORDER BY sort_order'
  ).all(req.params.attachmentId) as OutlineRow[];
  res.json(rows.map(rowToItem));
});

// PUT /:attachmentId — bulk-save entire outline (delete all + insert)
router.put('/:attachmentId', (req, res) => {
  const { items } = req.body as { items: Array<{
    id: string;
    parentId: string | null;
    title: string;
    pageNumber: number;
    destTop: number | null;
    sortOrder: number;
  }> };

  const attachmentId = req.params.attachmentId;

  const run = db.transaction(() => {
    db.prepare('DELETE FROM custom_outlines WHERE attachment_id = ?').run(attachmentId);

    const insert = db.prepare(`
      INSERT INTO custom_outlines (id, attachment_id, parent_id, title, page_number, dest_top, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Insert parents before children to satisfy foreign key constraint.
    // Items should already be ordered with parents first, but we do two passes
    // to be safe: first root items (parentId null), then children.
    const roots = items.filter(i => !i.parentId);
    const children = items.filter(i => i.parentId);
    for (const item of [...roots, ...children]) {
      insert.run(item.id, attachmentId, item.parentId, item.title, item.pageNumber, item.destTop, item.sortOrder);
    }
  });

  run();
  res.json({ ok: true });
});

// POST /:attachmentId/items — add a single item
router.post('/:attachmentId/items', (req, res) => {
  const { title, pageNumber, destTop, parentId, sortOrder } = req.body as {
    title: string;
    pageNumber: number;
    destTop: number | null;
    parentId?: string | null;
    sortOrder?: number;
  };

  const id = uuidv4();
  const attachmentId = req.params.attachmentId;

  // If no sortOrder given, append after the last sibling
  let order = sortOrder ?? 0;
  if (sortOrder == null) {
    const row = db.prepare(
      'SELECT MAX(sort_order) as max_order FROM custom_outlines WHERE attachment_id = ? AND parent_id IS ?'
    ).get(attachmentId, parentId ?? null) as { max_order: number | null } | undefined;
    order = (row?.max_order ?? -1) + 1;
  }

  db.prepare(`
    INSERT INTO custom_outlines (id, attachment_id, parent_id, title, page_number, dest_top, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, attachmentId, parentId ?? null, title, pageNumber, destTop ?? null, order);

  res.json({ id, attachmentId, parentId: parentId ?? null, title, pageNumber, destTop: destTop ?? null, sortOrder: order });
});

// PATCH /items/:id — rename
router.patch('/items/:id', (req, res) => {
  const { title } = req.body as { title: string };
  db.prepare('UPDATE custom_outlines SET title = ? WHERE id = ?').run(title, req.params.id);
  res.json({ ok: true });
});

// DELETE /items/:id — delete single item (CASCADE removes children)
router.delete('/items/:id', (req, res) => {
  db.prepare('DELETE FROM custom_outlines WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// DELETE /:attachmentId — delete entire custom outline (reset to PDF)
router.delete('/:attachmentId', (req, res) => {
  db.prepare('DELETE FROM custom_outlines WHERE attachment_id = ?').run(req.params.attachmentId);
  res.json({ ok: true });
});

export default router;

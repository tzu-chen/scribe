import { Router } from 'express';
import { db } from '../db.ts';

const router = Router();

interface ReadingTimeRow {
  attachment_id: string;
  filename: string;
  date_cst: string;
  total_seconds: number;
}

function rowToEntry(row: ReadingTimeRow) {
  return {
    attachmentId: row.attachment_id,
    filename: row.filename,
    dateCST: row.date_cst,
    totalSeconds: row.total_seconds,
  };
}

// GET /api/reading-time?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/', (req, res) => {
  const { start, end } = req.query;
  if (start && end) {
    const rows = db
      .prepare(
        'SELECT * FROM reading_time WHERE date_cst >= ? AND date_cst <= ? ORDER BY date_cst',
      )
      .all(start, end) as ReadingTimeRow[];
    res.json(rows.map(rowToEntry));
  } else {
    const rows = db
      .prepare('SELECT * FROM reading_time ORDER BY date_cst')
      .all() as ReadingTimeRow[];
    res.json(rows.map(rowToEntry));
  }
});

// POST /api/reading-time  { attachmentId, filename, dateCST, seconds }
router.post('/', (req, res) => {
  const { attachmentId, filename, dateCST, seconds } = req.body as {
    attachmentId: string;
    filename: string;
    dateCST: string;
    seconds: number;
  };

  if (!attachmentId || !dateCST || typeof seconds !== 'number') {
    res.status(400).json({ error: 'attachmentId, dateCST, and seconds are required' });
    return;
  }

  db.prepare(`
    INSERT INTO reading_time (attachment_id, filename, date_cst, total_seconds)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(attachment_id, date_cst) DO UPDATE SET
      total_seconds = total_seconds + excluded.total_seconds,
      filename = excluded.filename
  `).run(attachmentId, filename ?? '', dateCST, seconds);

  const row = db
    .prepare('SELECT * FROM reading_time WHERE attachment_id = ? AND date_cst = ?')
    .get(attachmentId, dateCST) as ReadingTimeRow;

  res.json(rowToEntry(row));
});

export default router;

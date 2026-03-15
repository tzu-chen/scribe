import { Router } from 'express';
import { db } from '../db.ts';

const router = Router();

interface GlobalTimerRow {
  date_cst: string;
  total_seconds: number;
}

function rowToEntry(row: GlobalTimerRow) {
  return {
    dateCST: row.date_cst,
    totalSeconds: row.total_seconds,
  };
}

// GET /api/global-timer?date=YYYY-MM-DD
router.get('/', (req, res) => {
  const { date } = req.query;
  if (!date || typeof date !== 'string') {
    res.status(400).json({ error: 'date query parameter is required' });
    return;
  }

  const row = db
    .prepare('SELECT * FROM global_timer WHERE date_cst = ?')
    .get(date) as GlobalTimerRow | undefined;

  res.json(row ? rowToEntry(row) : { dateCST: date, totalSeconds: 0 });
});

// POST /api/global-timer  { dateCST, seconds }
router.post('/', (req, res) => {
  const { dateCST, seconds } = req.body as {
    dateCST: string;
    seconds: number;
  };

  if (!dateCST || typeof seconds !== 'number') {
    res.status(400).json({ error: 'dateCST and seconds are required' });
    return;
  }

  db.prepare(`
    INSERT INTO global_timer (date_cst, total_seconds)
    VALUES (?, ?)
    ON CONFLICT(date_cst) DO UPDATE SET
      total_seconds = total_seconds + excluded.total_seconds
  `).run(dateCST, seconds);

  const row = db
    .prepare('SELECT * FROM global_timer WHERE date_cst = ?')
    .get(dateCST) as GlobalTimerRow;

  res.json(rowToEntry(row));
});

// DELETE /api/global-timer — clear all
router.delete('/', (_req, res) => {
  db.prepare('DELETE FROM global_timer').run();
  res.json({ ok: true });
});

export default router;

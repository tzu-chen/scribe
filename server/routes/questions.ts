import { Router } from 'express';
import { db } from '../db.ts';

const router = Router();

interface QuestionRow {
  id: string;
  text: string;
  node_id: string;
  node_title: string;
  flowchart_id: string;
  flowchart_name: string;
  checked: number;
  created_at: string;
}

function rowToQuestion(row: QuestionRow) {
  return {
    id: row.id,
    text: row.text,
    nodeId: row.node_id,
    nodeTitle: row.node_title,
    flowchartId: row.flowchart_id,
    flowchartName: row.flowchart_name,
    checked: row.checked === 1,
    createdAt: row.created_at,
  };
}

// GET / — list all questions
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM questions ORDER BY created_at DESC').all() as QuestionRow[];
  res.json(rows.map(rowToQuestion));
});

// GET /by-node?nodeId=X&flowchartId=Y — questions for a specific node
router.get('/by-node', (req, res) => {
  const { nodeId, flowchartId } = req.query;
  if (!nodeId || !flowchartId) {
    res.status(400).json({ error: 'nodeId and flowchartId are required' });
    return;
  }
  const rows = db.prepare(
    'SELECT * FROM questions WHERE node_id = ? AND flowchart_id = ? ORDER BY created_at'
  ).all(nodeId, flowchartId) as QuestionRow[];
  res.json(rows.map(rowToQuestion));
});

// GET /counts-by-node?flowchartId=Y — question counts per node for a flowchart
router.get('/counts-by-node', (req, res) => {
  const { flowchartId } = req.query;
  if (!flowchartId) {
    res.status(400).json({ error: 'flowchartId is required' });
    return;
  }
  const rows = db.prepare(
    'SELECT node_id, COUNT(*) as count FROM questions WHERE flowchart_id = ? GROUP BY node_id'
  ).all(flowchartId) as Array<{ node_id: string; count: number }>;

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.node_id] = row.count;
  }
  res.json(counts);
});

// POST / — create a question
router.post('/', (req, res) => {
  const { id, text, nodeId, nodeTitle, flowchartId, flowchartName } = req.body;

  if (!id || !text || !nodeId || !nodeTitle || !flowchartId || !flowchartName) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO questions (id, text, node_id, node_title, flowchart_id, flowchart_name, checked, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, text, nodeId, nodeTitle, flowchartId, flowchartName, now);

  const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as QuestionRow;
  res.json(rowToQuestion(row));
});

// PATCH /:id/checked — update checked state
router.patch('/:id/checked', (req, res) => {
  const { checked } = req.body;
  if (typeof checked !== 'boolean') {
    res.status(400).json({ error: 'checked must be a boolean' });
    return;
  }

  const result = db.prepare('UPDATE questions SET checked = ? WHERE id = ?').run(checked ? 1 : 0, req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Question not found' });
    return;
  }

  const row = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id) as QuestionRow;
  res.json(rowToQuestion(row));
});

// DELETE /:id — delete a question
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;

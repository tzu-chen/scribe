import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.ts';

const router = Router();

// --- Row interfaces ---

interface FlowchartRow {
  id: string;
  name: string;
  description: string | null;
  spec: string;
  created_at: string;
  updated_at: string;
}

interface FlowchartNodeRow {
  id: string;
  flowchart_id: string;
  node_key: string;
  title: string;
  refs: string | null;
  topics: string | null;
  stage_key: string | null;
}

// --- Row-to-DTO transformers ---

function rowToFlowchart(row: FlowchartRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    spec: JSON.parse(row.spec),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToFlowchartSummary(row: FlowchartRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToFlowchartNode(row: FlowchartNodeRow) {
  return {
    id: row.id,
    flowchartId: row.flowchart_id,
    nodeKey: row.node_key,
    title: row.title,
    refs: row.refs ?? undefined,
    topics: row.topics ?? undefined,
    stageKey: row.stage_key ?? undefined,
  };
}

// --- Helpers ---

interface SpecNode {
  id: string;
  stageKey?: string;
  title: string;
  refs?: string;
  topics?: string;
  feeds?: string;
  badge?: { text: string; style: string; background?: string; color?: string };
  x: number;
  y: number;
  width: number;
}

interface SpecEdge {
  from: string;
  to: string;
  fromAnchor: string;
  toAnchor: string;
  controlPoints: { c1: [number, number]; c2: [number, number] };
  style: 'primary' | 'secondary';
}

interface Spec {
  version: number;
  title: string;
  subtitle?: string;
  width: number;
  height: number;
  stages: unknown[];
  nodes: SpecNode[];
  edges: SpecEdge[];
  fonts?: { body: string; mono: string };
  background?: string;
}

function validateSpec(spec: unknown): string | null {
  if (!spec || typeof spec !== 'object') return 'spec must be an object';
  const s = spec as Record<string, unknown>;

  if (typeof s.title !== 'string') return 'spec.title is required';
  if (typeof s.width !== 'number') return 'spec.width is required';
  if (typeof s.height !== 'number') return 'spec.height is required';
  if (!Array.isArray(s.stages)) return 'spec.stages must be an array';
  if (!Array.isArray(s.nodes)) return 'spec.nodes must be an array';

  const nodeIds = new Set<string>();
  for (const node of s.nodes) {
    if (!node || typeof node !== 'object') return 'each node must be an object';
    const n = node as Record<string, unknown>;
    if (!n.id || typeof n.id !== 'string') return 'each node must have a string id';
    if (!n.title || typeof n.title !== 'string') return 'each node must have a string title';
    if (nodeIds.has(n.id)) return `duplicate node id: ${n.id}`;
    nodeIds.add(n.id);
  }

  if (s.edges != null) {
    if (!Array.isArray(s.edges)) return 'spec.edges must be an array';
    for (const edge of s.edges) {
      if (!edge || typeof edge !== 'object') return 'each edge must be an object';
      const e = edge as Record<string, unknown>;
      if (typeof e.from !== 'string' || !nodeIds.has(e.from))
        return `edge references unknown node: ${e.from}`;
      if (typeof e.to !== 'string' || !nodeIds.has(e.to))
        return `edge references unknown node: ${e.to}`;
    }
  }

  return null;
}

function rebuildFlowchartNodes(flowchartId: string, spec: Spec) {
  db.prepare('DELETE FROM flowchart_nodes WHERE flowchart_id = ?').run(flowchartId);

  const insert = db.prepare(`
    INSERT INTO flowchart_nodes (id, flowchart_id, node_key, title, refs, topics, stage_key)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const node of spec.nodes) {
    insert.run(
      `${flowchartId}:${node.id}`,
      flowchartId,
      node.id,
      node.title,
      node.refs ?? null,
      node.topics ?? null,
      node.stageKey ?? null,
    );
  }
}

// --- Routes ---
// Note: routes with literal path segments (/nodes/...) must be registered
// before parameterized routes (/:id) to avoid "nodes" being captured as :id.

// GET /nodes/search?title=X — search nodes across all flowcharts
router.get('/nodes/search', (req, res) => {
  const title = req.query.title;
  if (!title || typeof title !== 'string') {
    res.status(400).json({ error: 'title query parameter is required' });
    return;
  }
  const rows = db.prepare(
    'SELECT * FROM flowchart_nodes WHERE title LIKE ?'
  ).all(`%${title}%`) as FlowchartNodeRow[];
  res.json(rows.map(rowToFlowchartNode));
});

// GET /nodes/:flowchartId/:nodeKey — single node lookup
router.get('/nodes/:flowchartId/:nodeKey', (req, res) => {
  const row = db.prepare(
    'SELECT * FROM flowchart_nodes WHERE flowchart_id = ? AND node_key = ?'
  ).get(req.params.flowchartId, req.params.nodeKey) as FlowchartNodeRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Node not found' });
    return;
  }
  res.json(rowToFlowchartNode(row));
});

// GET / — list all flowcharts (no spec)
router.get('/', (_req, res) => {
  const rows = db.prepare(
    'SELECT id, name, description, created_at, updated_at FROM flowcharts'
  ).all() as FlowchartRow[];
  res.json(rows.map(rowToFlowchartSummary));
});

// GET /:id — full flowchart with spec
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM flowcharts WHERE id = ?').get(req.params.id) as FlowchartRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Flowchart not found' });
    return;
  }
  res.json(rowToFlowchart(row));
});

// GET /:id/nodes — list nodes for one flowchart
router.get('/:id/nodes', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM flowchart_nodes WHERE flowchart_id = ?'
  ).all(req.params.id) as FlowchartNodeRow[];
  res.json(rows.map(rowToFlowchartNode));
});

// POST / — create flowchart
router.post('/', (req, res) => {
  const { name, description, spec } = req.body;

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const specError = validateSpec(spec);
  if (specError) {
    res.status(400).json({ error: specError });
    return;
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  const run = db.transaction(() => {
    db.prepare(`
      INSERT INTO flowcharts (id, name, description, spec, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name.trim(), description?.trim() ?? null, JSON.stringify(spec), now, now);

    rebuildFlowchartNodes(id, spec as Spec);
  });
  run();

  const row = db.prepare('SELECT * FROM flowcharts WHERE id = ?').get(id) as FlowchartRow;
  res.json(rowToFlowchart(row));
});

// PUT /:id — full spec replacement
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, description, spec } = req.body;

  const existing = db.prepare('SELECT id FROM flowcharts WHERE id = ?').get(id) as { id: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Flowchart not found' });
    return;
  }

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const specError = validateSpec(spec);
  if (specError) {
    res.status(400).json({ error: specError });
    return;
  }

  const now = new Date().toISOString();

  const run = db.transaction(() => {
    db.prepare(`
      UPDATE flowcharts SET name = ?, description = ?, spec = ?, updated_at = ?
      WHERE id = ?
    `).run(name.trim(), description?.trim() ?? null, JSON.stringify(spec), now, id);

    rebuildFlowchartNodes(id, spec as Spec);
  });
  run();

  const row = db.prepare('SELECT * FROM flowcharts WHERE id = ?').get(id) as FlowchartRow;
  res.json(rowToFlowchart(row));
});

// PATCH /:id/nodes/:nodeKey — partial node update
router.patch('/:id/nodes/:nodeKey', (req, res) => {
  const { id, nodeKey } = req.params;

  const row = db.prepare('SELECT * FROM flowcharts WHERE id = ?').get(id) as FlowchartRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'Flowchart not found' });
    return;
  }

  const spec = JSON.parse(row.spec) as Spec;
  const nodeIndex = spec.nodes.findIndex(n => n.id === nodeKey);
  if (nodeIndex === -1) {
    res.status(404).json({ error: 'Node not found' });
    return;
  }

  const updates = req.body as Record<string, unknown>;
  const node = spec.nodes[nodeIndex];

  // Apply allowed fields
  if (updates.x !== undefined) node.x = updates.x as number;
  if (updates.y !== undefined) node.y = updates.y as number;
  if (updates.width !== undefined) node.width = updates.width as number;
  if (updates.title !== undefined) node.title = updates.title as string;
  if (updates.refs !== undefined) node.refs = updates.refs as string | undefined;
  if (updates.topics !== undefined) node.topics = updates.topics as string | undefined;
  if (updates.feeds !== undefined) node.feeds = updates.feeds as string | undefined;
  if (updates.stageKey !== undefined) node.stageKey = updates.stageKey as string;
  if (updates.badge !== undefined) node.badge = updates.badge as SpecNode['badge'];

  const specError = validateSpec(spec);
  if (specError) {
    res.status(400).json({ error: specError });
    return;
  }

  const now = new Date().toISOString();

  const run = db.transaction(() => {
    db.prepare('UPDATE flowcharts SET spec = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(spec), now, id);

    rebuildFlowchartNodes(id, spec);
  });
  run();

  // Return the updated node from the index table
  const nodeRow = db.prepare(
    'SELECT * FROM flowchart_nodes WHERE flowchart_id = ? AND node_key = ?'
  ).get(id, nodeKey) as FlowchartNodeRow;
  res.json(rowToFlowchartNode(nodeRow));
});

// DELETE /:id — delete flowchart (cascade deletes flowchart_nodes)
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM flowcharts WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

export default router;

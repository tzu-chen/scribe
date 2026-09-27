import { Router, type Response } from 'express';
import {
  SourceError,
  createSource,
  deleteSource,
  getSourceRow,
  listSources,
  previewSource,
  removeMissing,
  scanAllSources,
  scanSource,
  sourceEvents,
  updateSource,
  type SourceSettings,
} from '../lib/sources.ts';

// Linked folders: directories on disk whose PDFs are tracked in place.
// The scanning/watching logic lives in server/lib/sources.ts.

const router = Router();

function sendError(res: Response, err: unknown) {
  if (err instanceof SourceError) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error('[sources]', err);
  res.status(500).json({ error: 'Internal error' });
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');

/** Validate the settings fields of a body; `partial` allows any of them to be absent. */
function readSettings(body: Record<string, unknown>, partial: boolean): Partial<SourceSettings> | string {
  const out: Partial<SourceSettings> = {};
  if (body.path !== undefined || !partial) {
    if (typeof body.path !== 'string') return 'path must be a string';
    out.path = body.path;
  }
  if (body.recursive !== undefined) {
    if (typeof body.recursive !== 'boolean') return 'recursive must be a boolean';
    out.recursive = body.recursive;
  } else if (!partial) {
    out.recursive = true;
  }
  if (body.exclude !== undefined) {
    if (!isStringArray(body.exclude)) return 'exclude must be an array of strings';
    out.exclude = body.exclude;
  } else if (!partial) {
    out.exclude = [];
  }
  return out;
}

// GET /api/sources
router.get('/', (_req, res) => {
  res.json(listSources());
});

// GET /api/sources/events — server-sent events: `data: {"sourceId": ...}` after any change
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');
  const onChanged = (e: { sourceId: string }) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  sourceEvents.on('changed', onChanged);
  const ping = setInterval(() => res.write(': ping\n\n'), 30_000);
  req.on('close', () => {
    sourceEvents.off('changed', onChanged);
    clearInterval(ping);
  });
});

// POST /api/sources/preview — { path, recursive?, exclude?, sourceId? } dry run for the dialog
router.post('/preview', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const settings = readSettings(body, false);
  if (typeof settings === 'string') {
    res.status(400).json({ error: settings });
    return;
  }
  const sourceId = typeof body.sourceId === 'string' ? body.sourceId : undefined;
  try {
    res.json(await previewSource(settings as SourceSettings, sourceId));
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/sources/scan — rescan every folder (throttled); { changed }
router.post('/scan', async (_req, res) => {
  res.json({ changed: await scanAllSources() });
});

// POST /api/sources — { name?, path, recursive?, exclude?, adoptIds? }
router.post('/', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const settings = readSettings(body, false);
  if (typeof settings === 'string') {
    res.status(400).json({ error: settings });
    return;
  }
  if (body.adoptIds !== undefined && !isStringArray(body.adoptIds)) {
    res.status(400).json({ error: 'adoptIds must be an array of strings' });
    return;
  }
  try {
    const { id, summary } = await createSource({
      ...(settings as SourceSettings),
      name: typeof body.name === 'string' ? body.name : undefined,
      adoptIds: body.adoptIds as string[] | undefined,
    });
    res.json({ source: listSources().find(s => s.id === id), summary });
  } catch (err) {
    sendError(res, err);
  }
});

// PATCH /api/sources/:id — { name?, path?, recursive?, exclude? }; rescans
router.patch('/:id', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const settings = readSettings(body, true);
  if (typeof settings === 'string') {
    res.status(400).json({ error: settings });
    return;
  }
  if (!getSourceRow(req.params.id)) {
    res.status(404).json({ error: 'Linked folder not found' });
    return;
  }
  try {
    const summary = await updateSource(req.params.id, {
      ...settings,
      name: typeof body.name === 'string' ? body.name : undefined,
    });
    res.json({ source: listSources().find(s => s.id === req.params.id), summary });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/sources/:id/scan
router.post('/:id/scan', async (req, res) => {
  if (!getSourceRow(req.params.id)) {
    res.status(404).json({ error: 'Linked folder not found' });
    return;
  }
  try {
    res.json(await scanSource(req.params.id));
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/sources/:id/missing — drop items whose files are gone
router.delete('/:id/missing', (req, res) => {
  res.json({ removed: removeMissing(req.params.id) });
});

// DELETE /api/sources/:id — unlink; the folder's items leave the library, files stay on disk
router.delete('/:id', (req, res) => {
  deleteSource(req.params.id);
  res.status(204).end();
});

export default router;

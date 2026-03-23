import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import notesRouter from './routes/notes.ts';
import attachmentsRouter from './routes/attachments.ts';
import annotationsRouter from './routes/annotations.ts';
import readingTimeRouter from './routes/readingTime.ts';
import viewerPrefsRouter from './routes/viewerPrefs.ts';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3003;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');

app.use(express.json({ limit: '50mb' }));

// Allow cross-origin requests (for LAN access from different ports/devices)
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// --- API Routes ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/notes', notesRouter);
app.use('/api/attachments', attachmentsRouter);
app.use('/api/annotations', annotationsRouter);
app.use('/api/reading-time', readingTimeRouter);
app.use('/api/viewer-prefs', viewerPrefsRouter);

// --- Static Frontend (production) ---
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));

  // SPA fallback: serve index.html for any non-API route
  app.get('*path', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments');
const DB_PATH = path.join(DATA_DIR, 'scribe.db');

// Ensure directories exist
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode and foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft',
    category TEXT,
    subject TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL DEFAULT '',
    filename TEXT NOT NULL,
    type TEXT NOT NULL,
    size INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_opened_at TEXT,
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_attachments_subject ON attachments(subject);

  CREATE TABLE IF NOT EXISTS highlights (
    id TEXT PRIMARY KEY,
    attachment_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    rects TEXT NOT NULL,
    selected_text TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#ffec99',
    created_at TEXT NOT NULL,
    FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_highlights_attachment ON highlights(attachment_id);

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    highlight_id TEXT NOT NULL,
    attachment_id TEXT NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE CASCADE,
    FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_comments_highlight ON comments(highlight_id);
  CREATE INDEX IF NOT EXISTS idx_comments_attachment ON comments(attachment_id);

  CREATE TABLE IF NOT EXISTS reading_time (
    attachment_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    date_cst TEXT NOT NULL,
    total_seconds REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (attachment_id, date_cst)
  );

  CREATE TABLE IF NOT EXISTS viewer_prefs (
    attachment_id TEXT PRIMARY KEY,
    zoom REAL NOT NULL DEFAULT 1.0,
    fit_width INTEGER NOT NULL DEFAULT 0,
    current_page INTEGER NOT NULL DEFAULT 1,
    two_page_view INTEGER NOT NULL DEFAULT 0,
    scroll_offset_top REAL NOT NULL DEFAULT 0,
    crop_top REAL NOT NULL DEFAULT 0,
    crop_right REAL NOT NULL DEFAULT 0,
    crop_bottom REAL NOT NULL DEFAULT 0,
    crop_left REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

`);

// Migration: add last_opened_at column if missing (for existing databases)
const columns = db.prepare("PRAGMA table_info(attachments)").all() as Array<{ name: string }>;
if (!columns.some(c => c.name === 'last_opened_at')) {
  db.exec('ALTER TABLE attachments ADD COLUMN last_opened_at TEXT');
}

// Migration: add crop columns to viewer_prefs if missing
const vpColumns = db.prepare("PRAGMA table_info(viewer_prefs)").all() as Array<{ name: string }>;
if (!vpColumns.some(c => c.name === 'crop_top')) {
  db.exec(`
    ALTER TABLE viewer_prefs ADD COLUMN crop_top REAL NOT NULL DEFAULT 0;
    ALTER TABLE viewer_prefs ADD COLUMN crop_right REAL NOT NULL DEFAULT 0;
    ALTER TABLE viewer_prefs ADD COLUMN crop_bottom REAL NOT NULL DEFAULT 0;
    ALTER TABLE viewer_prefs ADD COLUMN crop_left REAL NOT NULL DEFAULT 0;
  `);
}

// Migration: add folder_id column to attachments if missing
const attColumns = db.prepare("PRAGMA table_info(attachments)").all() as Array<{ name: string }>;
if (!attColumns.some(c => c.name === 'folder_id')) {
  db.exec('ALTER TABLE attachments ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL');
}

// Create index after migration ensures folder_id column exists
db.exec('CREATE INDEX IF NOT EXISTS idx_attachments_folder ON attachments(folder_id)');

export { db, ATTACHMENTS_DIR };

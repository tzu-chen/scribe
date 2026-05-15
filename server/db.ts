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
    show_toc INTEGER NOT NULL DEFAULT 0,
    crop_top REAL NOT NULL DEFAULT 0,
    crop_right REAL NOT NULL DEFAULT 0,
    crop_bottom REAL NOT NULL DEFAULT 0,
    crop_left REAL NOT NULL DEFAULT 0,
    crop_top_even REAL NOT NULL DEFAULT 0,
    crop_right_even REAL NOT NULL DEFAULT 0,
    crop_bottom_even REAL NOT NULL DEFAULT 0,
    crop_left_even REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS custom_outlines (
    id TEXT PRIMARY KEY,
    attachment_id TEXT NOT NULL,
    parent_id TEXT,
    title TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    dest_top REAL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES custom_outlines(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_custom_outlines_attachment ON custom_outlines(attachment_id);

  CREATE TABLE IF NOT EXISTS flowcharts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    spec TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS flowchart_nodes (
    id TEXT PRIMARY KEY,
    flowchart_id TEXT NOT NULL,
    node_key TEXT NOT NULL,
    title TEXT NOT NULL,
    refs TEXT,
    topics TEXT,
    stage_key TEXT,
    FOREIGN KEY (flowchart_id) REFERENCES flowcharts(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_fn_flowchart ON flowchart_nodes(flowchart_id);
  CREATE INDEX IF NOT EXISTS idx_fn_key ON flowchart_nodes(node_key);
  CREATE INDEX IF NOT EXISTS idx_fn_title ON flowchart_nodes(title);

  CREATE TABLE IF NOT EXISTS book_tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attachment_tags (
    attachment_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    PRIMARY KEY (attachment_id, tag_id),
    FOREIGN KEY (attachment_id) REFERENCES attachments(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES book_tags(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_attachment_tags_attachment ON attachment_tags(attachment_id);
  CREATE INDEX IF NOT EXISTS idx_attachment_tags_tag ON attachment_tags(tag_id);

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    node_id TEXT NOT NULL,
    node_title TEXT NOT NULL,
    flowchart_id TEXT NOT NULL,
    flowchart_name TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_questions_node ON questions(node_id, flowchart_id);
  CREATE INDEX IF NOT EXISTS idx_questions_flowchart ON questions(flowchart_id);

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

// Migration: add even-page crop columns to viewer_prefs if missing.
// Existing rows default to 0 for the new columns; the server route backfills
// from the odd-page values when responding, so pre-existing crops continue to
// apply to every page until the user explicitly sets different even-page values.
const vpColumnsAfter = db.prepare("PRAGMA table_info(viewer_prefs)").all() as Array<{ name: string }>;
if (!vpColumnsAfter.some(c => c.name === 'crop_top_even')) {
  db.exec(`
    ALTER TABLE viewer_prefs ADD COLUMN crop_top_even REAL NOT NULL DEFAULT 0;
    ALTER TABLE viewer_prefs ADD COLUMN crop_right_even REAL NOT NULL DEFAULT 0;
    ALTER TABLE viewer_prefs ADD COLUMN crop_bottom_even REAL NOT NULL DEFAULT 0;
    ALTER TABLE viewer_prefs ADD COLUMN crop_left_even REAL NOT NULL DEFAULT 0;
    UPDATE viewer_prefs SET
      crop_top_even = crop_top,
      crop_right_even = crop_right,
      crop_bottom_even = crop_bottom,
      crop_left_even = crop_left;
  `);
}

// Migration: add show_toc column to viewer_prefs if missing
const vpColumnsForToc = db.prepare("PRAGMA table_info(viewer_prefs)").all() as Array<{ name: string }>;
if (!vpColumnsForToc.some(c => c.name === 'show_toc')) {
  db.exec('ALTER TABLE viewer_prefs ADD COLUMN show_toc INTEGER NOT NULL DEFAULT 0');
}

// Migration: add folder_id column to attachments if missing
const attColumns = db.prepare("PRAGMA table_info(attachments)").all() as Array<{ name: string }>;
if (!attColumns.some(c => c.name === 'folder_id')) {
  db.exec('ALTER TABLE attachments ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL');
}

// Create index after migration ensures folder_id column exists
db.exec('CREATE INDEX IF NOT EXISTS idx_attachments_folder ON attachments(folder_id)');

// Migration: add attachment_id and page columns to notes if missing
const noteColumns = db.prepare("PRAGMA table_info(notes)").all() as Array<{ name: string }>;
if (!noteColumns.some(c => c.name === 'attachment_id')) {
  db.exec(`
    ALTER TABLE notes ADD COLUMN attachment_id TEXT;
    ALTER TABLE notes ADD COLUMN page INTEGER;
  `);
}
db.exec('CREATE INDEX IF NOT EXISTS idx_notes_attachment ON notes(attachment_id)');

export { db, ATTACHMENTS_DIR };

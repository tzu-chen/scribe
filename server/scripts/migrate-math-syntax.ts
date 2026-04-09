/**
 * One-time migration: convert old Scribe math syntax to standard LaTeX delimiters.
 *
 * Old format:
 *   Inline: `$$expression$$`
 *   Block:  ```katex\n...\n```
 *
 * New format (Granary-compatible):
 *   Inline: $expression$
 *   Display: $$\n...\n$$
 *
 * Usage: npx tsx server/scripts/migrate-math-syntax.ts
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', '..', 'data', 'scribe.db');

const db = new Database(DB_PATH);

interface NoteRow {
  id: string;
  content: string;
}

const notes = db.prepare('SELECT id, content FROM notes').all() as NoteRow[];

let migrated = 0;

const update = db.prepare('UPDATE notes SET content = ? WHERE id = ?');

const migrateAll = db.transaction(() => {
  for (const note of notes) {
    let content = note.content;
    const original = content;

    // Convert ```katex\n...\n``` to $$\n...\n$$
    content = content.replace(/```katex\s*\n([\s\S]*?)```/g, (_match, body: string) => {
      return `$$\n${body.trimEnd()}\n$$`;
    });

    // Convert `$$expression$$` to $expression$
    content = content.replace(/`\$\$([\s\S]*?)\$\$`/g, (_match, expr: string) => {
      return `$${expr}$`;
    });

    if (content !== original) {
      update.run(content, note.id);
      migrated++;
      console.log(`  Migrated note: ${note.id}`);
    }
  }
});

console.log(`Found ${notes.length} notes.`);
migrateAll();
console.log(`Done. Migrated ${migrated} note(s).`);

db.close();

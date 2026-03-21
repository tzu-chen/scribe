# Scribe — INTEROP.md

Cross-app integration spec for Scribe. This documents the endpoints and data shapes that sibling apps (Navigate, Monolith, Granary) may call or reference.

**Base URL:** `http://localhost:3003/api`  
**Port:** 3003 (server), 5173 (Vite dev)  

---

## Data Available to Other Apps

### Notes

Scribe is the source of truth for study notes, organized by subject and linked to flowchart nodes.

**List all notes:**
```
GET /api/notes
```
Returns all notes:
```typescript
interface Note {
  id: string;              // UUID
  title: string;
  content: string;         // Markdown with KaTeX LaTeX
  tags: string[];          // JSON array stored as TEXT
  status: 'draft' | 'published';
  category?: string;
  subject?: string;        // Links notes to flowchart node titles / attachment subjects
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
}
```

**Get a single note:**
```
GET /api/notes/:id
```

**Upsert a note (create or update):**
```
PUT /api/notes/:id
```
Body: full `Note` object. ID is client-generated (UUID).

### Attachments (PDF Library)

**List all attachments:**
```
GET /api/attachments
```
Returns attachment metadata (id, filename, subject, file size, dates).

**Filter by subject:**
```
GET /api/attachments/by-subject?subject=<subject>
```

**Download file blob:**
```
GET /api/attachments/:id/blob
```

**Upload a file:**
```
POST /api/attachments
```
Multipart form data (via multer). Fields: `file` (the blob), plus optional metadata.

### Annotations (PDF Highlights & Comments)

**Get highlights for an attachment:**
```
GET /api/annotations/highlights?attachmentId=<id>
```
Returns `PdfHighlight[]` with highlight rects, selected text, color.

**Get comments:**
```
GET /api/annotations/comments?attachmentId=<id>
```

### Reading Time

**Get reading time entries:**
```
GET /api/reading-time?start=YYYY-MM-DD&end=YYYY-MM-DD
```
Returns per-attachment daily reading seconds.

**Global daily timer:**
```
GET /api/global-timer?date=YYYY-MM-DD
```

### Flowcharts

Flowcharts are static HTML files in `public/flowchart/`, listed via a manifest:
```
GET /flowchart/index.json
```
Returns:
```json
{ "flowcharts": [{ "id": "...", "name": "...", "filename": "...", "description": "..." }] }
```

Flowchart node IDs and titles are embedded in the HTML files — there is no API for querying individual nodes. Cross-app references to flowchart nodes should use the **node title** (which matches the `subject` field on notes and attachments).

### Questions

**Note:** Questions are currently stored in **localStorage** (`scribe_questions` key), not server-side. They are not accessible via API. This is a known migration gap.

```typescript
interface Question {
  id: string;
  nodeId: string;           // Flowchart node ID
  nodeTitle: string;        // Human-readable node name
  flowchartId: string;
  question: string;         // The question text
  answer?: string;          // Optional answer
  createdAt: string;
}
```

---

## Cross-App Reference Keys

When other apps link to Scribe entities, use these identifiers:

| Entity | Key | Example |
|--------|-----|---------|
| Note | `id` (UUID string) | `"a1b2c3d4-..."` |
| Attachment | `id` (UUID string) | `"e5f6g7h8-..."` |
| Flowchart | `id` (string from index.json) | `"stochastic-analysis"` |
| Flowchart node | `nodeTitle` (string) | `"Hahn-Banach Theorem"` |
| Subject | `subject` (string) | `"Functional Analysis"` |

**Recommended:** Use `note_id` (UUID) for linking to specific notes. Use `flowchart_node` title string for linking to flowchart nodes (since nodes don't have stable API-accessible IDs beyond their title).

---

## Planned Endpoints for Cross-App Use (Not Yet Implemented)

| Consumer | Endpoint | Purpose |
|----------|----------|---------|
| Navigate | `POST /api/notes` | "Send to Scribe" — create a note pre-filled with paper metadata |
| Granary | `POST /api/notes` | Promote a Granary entry to a Scribe note |
| Granary | `GET /api/notes?subject=<subject>` | Fetch notes for a topic to check for duplication |
| Monolith | `GET /api/notes?subject=<subject>` | Gather notes for a topic to export as .tex draft |

# Scribe — INTEROP.md

Cross-app integration spec for Scribe. This documents the endpoints and data shapes that sibling apps (Pyramid, Navigate, Monolith, Granary) may call or reference.

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

Flowcharts are stored in SQLite and served via a REST API. Each flowchart contains a `FlowchartSpec` JSON with nodes, edges, positions, and stage colors.

**List all flowcharts (summaries):**
```
GET /api/flowcharts
```
Returns `{ id, name, description, created_at, updated_at }[]` (no spec JSON).

**Get full flowchart with spec:**
```
GET /api/flowcharts/:id
```

**List nodes for a flowchart:**
```
GET /api/flowcharts/:id/nodes
```
Returns `FlowchartNodeRecord[]` from the denormalized index table.

**Search nodes across all flowcharts:**
```
GET /api/flowcharts/nodes/search?title=X
```
Searches by title substring. Useful for cross-app linking.

**Get a single node:**
```
GET /api/flowcharts/nodes/:flowchartId/:nodeKey
```
Returns a single node's content (title, refs, topics, stage). Primary endpoint for Pyramid to fetch node details.

```typescript
interface FlowchartNodeRecord {
  id: string;              // Composite: "{flowchart_id}:{node_key}"
  flowchart_id: string;
  node_key: string;        // Stable short ID (e.g., "qsvt", "linalg")
  title: string;           // Display title
  refs?: string;           // Markdown references
  topics?: string;         // Covered topics
  stage_key?: string;      // Stage grouping
}
```

### Questions

Questions are linked to flowchart nodes and stored in SQLite.

**List all questions:**
```
GET /api/questions
```

**Get questions for a specific node:**
```
GET /api/questions/by-node?nodeId=X&flowchartId=Y
```

**Get question counts per node:**
```
GET /api/questions/counts-by-node?flowchartId=Y
```
Returns `Record<nodeId, count>`.

```typescript
interface Question {
  id: string;
  text: string;            // The question text
  nodeId: string;          // Flowchart node key
  nodeTitle: string;       // Human-readable node name
  flowchartId: string;
  flowchartName: string;
  checked: boolean;
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
| Flowchart | `id` (UUID string) | `"f1234567-..."` |
| Flowchart node | `node_key` (short string) | `"qsvt"`, `"linalg"` |
| Question | `id` (UUID string) | `"q1234567-..."` |
| Subject | `subject` (string) | `"Functional Analysis"` |

**Recommended:** Use `node_key` (the short semantic ID) for linking to flowchart nodes. Query via `GET /api/flowcharts/nodes/:flowchartId/:nodeKey`.

---

## Cross-App Use Cases

| Consumer | Endpoint | Purpose |
|----------|----------|---------|
| Pyramid | `GET /api/flowcharts/nodes/:fId/:nodeKey` | Fetch node content (title, refs, topics) for display |
| Pyramid | `GET /api/flowcharts/nodes/search?title=X` | Search for nodes across all flowcharts |
| Pyramid | `GET /api/flowcharts/:id/nodes` | List all nodes in a flowchart |
| Pyramid | `GET /api/questions/by-node?nodeId=X&flowchartId=Y` | Fetch questions for a node |
| Navigate | `PUT /api/notes/:id` | "Send to Scribe" — create a note pre-filled with paper metadata |
| Granary | `PUT /api/notes/:id` | Promote a Granary entry to a Scribe note |
| Monolith | `GET /api/notes` | Gather notes for export as .tex draft |

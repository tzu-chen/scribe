# Scribe - CLAUDE.md

## Project Overview

Scribe is a study tool built with React 19, TypeScript, and Vite on the frontend, backed by an **Express + SQLite** server. The app helps users manage:

- A **Library** of uploaded PDF and other files
- **Notes** written in Markdown with LaTeX support
- **Flowcharts** (static HTML files served from `/public/flowchart/`) with interactive node actions
- **Questions** linked to flowchart nodes
- A **Reading Summary** with time-tracking heatmaps

### Architecture History

The project was originally a **fully client-side, offline-first application** using localStorage and IndexedDB for all data storage. In March 2025, it was migrated to a **client-server architecture** with:
- An Express.js backend serving a REST API
- SQLite (via `better-sqlite3`) for persistent storage
- File uploads stored on the server filesystem

**A few features still use client-side storage** (see [Data Storage](#data-storage) below).

---

## Development Commands

```bash
npm run dev          # Start both client (Vite) and server (Express) concurrently
npm run dev:client   # Start Vite dev server only (HMR)
npm run dev:server   # Start Express server only (tsx watch, auto-reload)
npm run build        # TypeScript check + Vite production build
npm run lint         # ESLint
npm run preview      # Preview the production build locally (client only)
npm run start        # Start Express server in production (serves built client from dist/)
```

In development, `npm run dev` runs both processes via `concurrently`:
- **Vite dev server** — serves the React app with HMR
- **Express server** — runs on port 3001 (configurable via `PORT` env var)
- Vite proxies `/api/*` requests to the Express server (configured in `vite.config.ts`)

In production, the Express server serves the built React app from `dist/` and handles all API requests on a single port.

There are **no tests** in this project currently.

---

## Architecture

### Tech Stack

#### Frontend (React SPA)

| Tool | Version | Purpose |
|---|---|---|
| React | 19 | UI framework |
| TypeScript | ~5.9 | Type safety (strict mode) |
| Vite + SWC | 7.x | Build tool and dev server |
| React Router | 7.x | Client-side routing |
| `@uiw/react-md-editor` | 4.x | Markdown editor with preview |
| KaTeX | 0.16.x | LaTeX math rendering |
| `pdfjs-dist` | 5.x | PDF rendering in-browser |
| Recharts | 3.x | Charts (reading summary) |
| date-fns | 4.x | Date utilities |
| uuid | 13.x | UUID generation |

#### Backend (Express + SQLite)

| Tool | Version | Purpose |
|---|---|---|
| Express | 5.x | HTTP server and REST API |
| better-sqlite3 | 12.x | SQLite database |
| multer | 2.x | File upload handling (multipart) |
| tsx | 4.x | TypeScript execution for server |
| concurrently | 9.x | Run client + server in parallel |

### Directory Structure

```
server/
  index.ts                   # Express app setup, CORS, static file serving
  db.ts                      # SQLite schema init + migrations
  routes/
    notes.ts                 # CRUD for notes
    attachments.ts           # Upload, download, list, delete attachments
    annotations.ts           # PDF highlights and comments
    readingTime.ts           # Per-attachment reading time tracking
    globalTimer.ts           # Global daily timer

data/                        # Created at runtime, git-ignored
  scribe.db                  # SQLite database file
  attachments/               # Uploaded file blobs stored on disk

src/
  App.tsx                    # Root: router + ThemeProvider + Layout
  main.tsx                   # React entry point
  global.css                 # CSS custom properties (design tokens), reset
  types/                     # TypeScript interfaces (no logic)
    note.ts                  # Note, NoteStatus
    attachment.ts            # Attachment, AttachmentMeta
    annotation.ts            # PdfHighlight, PdfComment, HighlightRect
    question.ts              # Question
    readingTime.ts           # ReadingTimeEntry, ReadingTimeMap
  services/                  # Data access layer (calls REST API or localStorage)
    noteStorage.ts           # REST API → /api/notes
    attachmentStorage.ts     # REST API → /api/attachments
    annotationStorage.ts     # REST API → /api/annotations
    readingTimeStorage.ts    # REST API → /api/reading-time
    globalTimerStorage.ts    # REST API → /api/global-timer
    questionStorage.ts       # localStorage (key: scribe_questions) — not yet migrated
    themeStorage.ts          # localStorage (key: scribe_theme)
    viewerPrefsStorage.ts    # localStorage (key: scribe_viewer_prefs)
  hooks/                     # Custom React hooks (wrap services + React state)
    useNotes.ts
    useAutoSave.ts
    useCategories.ts
    useTags.ts
    useSubjects.ts
    usePdfDocument.ts
    usePdfAnnotations.ts
    useReadingTimeTracker.ts
    useReadingSummary.ts
    useGlobalTimer.ts
  contexts/
    ThemeContext.tsx          # Theme ('default' | 'dark'), reads/writes themeStorage
  components/                # Reusable UI components
    Layout/                  # App shell: header nav + main content area
    NoteEditor/              # @uiw/react-md-editor wrapper with KaTeX support
    NoteCard/                # Note list item
    NoteToolbar/             # Save/publish/delete toolbar
    TagInput/                # Tag chip input
    TagFilter/               # Tag filter chips
    CategorySelect/          # Category autocomplete input
    SearchBar/               # Search input
    ThemeMenu/               # Light/dark toggle
    BookPicker/              # Modal for picking an existing attachment
    PdfViewer/               # All PDF viewer sub-components (see below)
  pages/                     # Route-level components
    Library/LibraryPage.tsx          # / — upload and browse attachments
    Notes/NotesPage.tsx              # /notes — list/filter/search notes
    Editor/EditorPage.tsx            # /note/new, /note/:id/edit
    View/ViewPage.tsx                # /note/:id (read-only)
    Flowcharts/FlowchartsPage.tsx    # /flowcharts — flowchart picker + iframe viewer
    PdfViewer/PdfViewerPage.tsx      # /pdf/:attachmentId
    Questions/QuestionsPage.tsx      # /questions — review node questions
    Summary/SummaryPage.tsx          # /summary — reading time heatmap
public/
  flowchart/
    flowchart-integration.js  # Injected into flowchart iframes at runtime
    flowchart-theme.css        # Theme CSS injected into flowchart iframes
    flowchart-interactive.html # Example flowchart structure
    index.json                 # Flowchart manifest (loaded by FlowchartsPage)
```

### TypeScript Configuration

The project uses **TypeScript project references** with three configs:
- `tsconfig.app.json` — React app (ES2022, JSX)
- `tsconfig.server.json` — Node.js server (ES2023)
- `tsconfig.node.json` — Vite/build tooling
- `tsconfig.json` — References all three

---

## Data Storage

Data is split between the **server** (SQLite + filesystem) and **client** (localStorage).

### Server-side (SQLite database at `data/scribe.db`)

| Table | Key | Description |
|---|---|---|
| `notes` | `id` (TEXT) | Note content, tags (JSON), status, category, subject |
| `attachments` | `id` (TEXT) | File metadata; actual blobs stored at `data/attachments/` |
| `highlights` | `id` (TEXT) | PDF highlight rects (JSON), selected text, color; FK → attachments |
| `comments` | `id` (TEXT) | Annotation comments; FK → highlights, FK → attachments |
| `reading_time` | `(attachment_id, date_cst)` | Per-attachment daily reading seconds |
| `global_timer` | `date_cst` | Global daily reading seconds |

SQLite features enabled: WAL mode, foreign key constraints, CASCADE deletes.

### Client-side (localStorage) — not yet migrated to server

| Key | Type | Contents |
|---|---|---|
| `scribe_questions` | JSON array | `Question[]` |
| `scribe_theme` | string | `'default'` or `'dark'` |
| `scribe_viewer_prefs` | JSON object | `Record<attachmentId, ViewerPrefs>` |

### File Storage

Uploaded files (PDFs, etc.) are stored on the server filesystem at `data/attachments/`. The `attachments` table stores metadata and a `file_path` pointing to the file on disk. Files are served via `GET /api/attachments/:id/blob`.

---

## API Endpoints

All endpoints are prefixed with `/api/`.

### Notes
- `GET /api/notes` — list all notes
- `GET /api/notes/:id` — get a single note
- `PUT /api/notes/:id` — upsert (create or update) a note
- `DELETE /api/notes/:id` — delete a note

### Attachments
- `GET /api/attachments` — list all attachments
- `GET /api/attachments/by-subject?subject=X` — filter by subject
- `GET /api/attachments/counts-by-subject` — aggregate attachment counts per subject
- `POST /api/attachments` — upload a file (multipart form data via multer)
- `GET /api/attachments/:id/blob` — download the file blob
- `PATCH /api/attachments/:id/subject` — update subject
- `PATCH /api/attachments/:id/filename` — rename file
- `PATCH /api/attachments/:id/last-opened` — mark as recently opened
- `DELETE /api/attachments/:id` — delete attachment (cascades to DB rows + filesystem)

### Annotations
- `GET /api/annotations/highlights?attachmentId=X` — list highlights for an attachment
- `POST /api/annotations/highlights` — create a highlight
- `DELETE /api/annotations/highlights/:id` — delete a highlight
- `GET /api/annotations/comments?highlightId=X` or `?attachmentId=X` — list comments
- `POST /api/annotations/comments` — create a comment
- `PATCH /api/annotations/comments/:id` — update comment text
- `DELETE /api/annotations/comments/:id` — delete a comment
- `DELETE /api/annotations/comments?highlightId=X` — batch delete comments by highlight

### Reading Time
- `GET /api/reading-time` — all entries (optional `?start=DATE&end=DATE` filter)
- `POST /api/reading-time` — accumulate seconds for attachment + date
- `DELETE /api/reading-time` — clear all reading time data

### Global Timer
- `GET /api/global-timer?date=YYYY-MM-DD` — get total seconds for a date
- `POST /api/global-timer` — accumulate seconds for a date
- `DELETE /api/global-timer?date=YYYY-MM-DD` — reset (or all if no date param)

### Health
- `GET /api/health` — returns `{ status: 'ok', timestamp: ... }`

---

## Routing (Client-side)

| Path | Component | Description |
|---|---|---|
| `/` | `LibraryPage` | Upload/browse books |
| `/notes` | `NotesPage` | Browse and filter notes |
| `/note/new` | `EditorPage` | Create new note (optional `?subject=` param) |
| `/note/:id/edit` | `EditorPage` | Edit existing note |
| `/note/:id` | `ViewPage` | Read-only note view |
| `/flowcharts` | `FlowchartsPage` | Flowchart list; `?view=<id>` to open one |
| `/pdf/:attachmentId` | `PdfViewerPage` | PDF viewer (optional `?subject=` and `?flowchart=`) |
| `/questions` | `QuestionsPage` | Review questions from flowchart nodes |
| `/summary` | `SummaryPage` | Reading time heatmap |

---

## Key Conventions

### TypeScript

- **Strict mode** is on (`strict: true`, plus `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`).
- Use `import type` for type-only imports (`verbatimModuleSyntax` is enabled).
- No `.tsx` extensions in import paths (bundler mode resolves them automatically).
- IDs are generated with `uuidv4()` from the `uuid` package (or `crypto.randomUUID()` — both are used).

### Component Conventions

- Each component lives in its own folder: `components/ComponentName/ComponentName.tsx` + `ComponentName.module.css`.
- Pages follow the same pattern: `pages/PageName/PageName.tsx` + `PageName.module.css`.
- CSS is done exclusively with **CSS Modules** (`.module.css`) — no utility-class framework.
- Design tokens (colors, spacing, border-radius, etc.) are defined as CSS custom properties in `global.css` under `:root` and `[data-theme="dark"]`. Always use these variables instead of hard-coded values.

### Styling / Theming

- The theme is toggled by setting or removing `data-theme="dark"` on `document.documentElement`.
- Theme is persisted to `localStorage` via `themeStorage` and consumed through `ThemeContext`.
- Flowchart iframes receive the theme via direct DOM manipulation (`htmlEl.setAttribute('data-theme', 'dark')`) — not postMessage.
- The PDF viewer uses `--color-pdf-bg` and `--pdf-highlight-blend` CSS variables that change between light (`multiply`) and dark (`screen`) modes.

### Service Layer Pattern

- Services are plain objects (not classes) exported as `const serviceName = { ... }`.
- **Server-backed services** (notes, attachments, annotations, reading time, global timer) are async and use `fetch()` to call the REST API.
- **Client-only services** (questions, theme, viewer prefs) use localStorage and may be synchronous.
- Services do **not** use React hooks.
- Hooks wrap services and expose React state + callbacks.

### Server / Database Conventions

- Server routes live in `server/routes/` — one file per resource.
- Database schema and initialization are in `server/db.ts`.
- The `db` object and `ATTACHMENTS_DIR` path are exported from `server/db.ts` for use in routes.
- JSON columns (e.g., `tags`, `rects`) are stored as TEXT and parsed/serialized in the route handlers.
- File uploads use `multer` with in-memory storage; blobs are written to `data/attachments/` by the route handler.
- CORS is enabled (allows `*` origin) for LAN access from different devices/ports.

### Auto-save

`useAutoSave` debounces note saves with a 1500 ms delay. It compares a serialized "noteKey" string to detect actual changes and avoid spurious saves. The editor page uses `useMemo` keyed on specific fields to construct the note object passed to `useAutoSave`, preventing unnecessary effect runs.

### Reading Time Tracking

`useReadingTimeTracker` tracks active reading time per attachment per CST calendar date:
- Accumulates seconds via a 1 s tick interval (capped at 2 s per tick to handle tab switches).
- Detects idleness after 60 s of no user activity (`mousemove`, `keydown`, `scroll`, etc.) and pauses accumulation.
- Flushes to the server (`POST /api/reading-time`) every 30 s and on page unload / tab hide.
- Dates are recorded in **CST (UTC-6, fixed offset)** — the code does not adjust for CDT.

### Flowchart Integration

Flowcharts are static HTML files placed in `public/flowchart/`. They must expose `highlightChain`, `clearHighlight`, and `selectedNode` as globals. The app:
1. Renders the flowchart HTML in a same-origin `<iframe>`.
2. Injects `flowchart-integration.js`, `flowchart-theme.css`, and `flowchart-theme.js` into the iframe at `onLoad` time.
3. Communicates with the iframe via `window.postMessage` for attachment counts and question counts.
4. Receives `node-selected`, `node-deselected`, and `node-action` messages from the iframe.

Node actions supported: `write-note`, `attach-file`, `view-attachments`, `view-notes`, `add-question`.

Flowcharts are listed via `/flowchart/index.json` (served from `public/`) with shape:
```json
{ "flowcharts": [{ "id": "...", "name": "...", "filename": "...", "description": "..." }] }
```

### Note Model

```ts
interface Note {
  id: string;
  title: string;
  content: string;       // Markdown
  tags: string[];
  status: 'draft' | 'published';
  category?: string;
  subject?: string;      // Links notes to flowchart node titles / attachment subjects
  createdAt: string;     // ISO 8601
  updatedAt: string;     // ISO 8601
}
```

Notes support **LaTeX** in the Markdown editor:
- Inline: `` `$$expression$$` ``
- Block: fenced code block with language `katex`

### PDF Viewer

The PDF viewer (`PdfViewerPage`) composes multiple sub-components:
- `PdfToolbar` — zoom, fit-width, TOC toggle, right panel toggle
- `PdfSidebar` — table of contents from PDF outline
- `PdfDocumentView` — scrollable virtualized page list (via `usePdfDocument`)
- `PdfRightPanel` — highlights, comments, and related notes panel
- `PdfSelectionToolbar` — floating toolbar on text selection (highlight / highlight + comment)
- `PdfCommentPopover` — popover for viewing/editing comments on a highlight
- `PdfHighlightLayer` — renders highlight rectangles over PDF pages

Viewer preferences (zoom, fit-width, current page) are saved per-attachment to `viewerPrefsStorage` with a 1 s debounce and immediately on `beforeunload`.

---

## ESLint

Config is in `eslint.config.js` (flat config format). Active rule sets:
- `@eslint/js` recommended
- `typescript-eslint` recommended
- `eslint-plugin-react-hooks` recommended
- `eslint-plugin-react-refresh` Vite preset

Run: `npm run lint`

---

## Adding a New Flowchart

1. Create an HTML file in `public/flowchart/` following the existing conventions (nodes use `.node` class, have `highlightChain` / `clearHighlight` / `selectedNode` globals).
2. Add an entry to `public/flowchart/index.json`.
3. The integration script and theme files are injected automatically — do not `<script>` them in the HTML.

## Adding a New Page / Route

1. Create `src/pages/NewPage/NewPage.tsx` and `NewPage.module.css`.
2. Add a `<Route>` in `src/App.tsx`.
3. Add a `<Link>` in `src/components/Layout/Layout.tsx` if it belongs in the nav.

## Adding a New API Endpoint

1. Create or edit a route file in `server/routes/`.
2. Register the router in `server/index.ts` with `app.use('/api/...', router)`.
3. If new tables are needed, add `CREATE TABLE IF NOT EXISTS` statements in `server/db.ts`.

## Adding a New Storage Key

For **server-backed storage** (recommended for shared/important data):
1. Add the type to `src/types/`.
2. Add a database table in `server/db.ts`.
3. Create route handlers in `server/routes/`.
4. Create `src/services/newStorage.ts` that calls the REST API via `fetch()`.
5. Create a hook in `src/hooks/` if React components need to consume it.

For **client-only storage** (appropriate for UI preferences):
1. Add the type to `src/types/`.
2. Create `src/services/newStorage.ts` using localStorage.
3. Create a hook in `src/hooks/` if React components need to consume it.

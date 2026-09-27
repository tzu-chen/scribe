# Scribe - CLAUDE.md

## Project Overview

Scribe is a study tool built with React 19, TypeScript, and Vite on the frontend, backed by an **Express + SQLite** server. The app helps users manage:

- A **Library** of uploaded PDF and other files — plus **linked folders** tracked in place on disk — organised along three axes — *kind* (book/paper/draft/notes), *project* (many-to-many, archivable) and *activity* (derived from reading data) — with a shelf-style Home and a filterable Browse view
- **Notes** written in Markdown with LaTeX support
- **Flowcharts** — data-driven flowcharts stored in SQLite, rendered with React+SVG, with interactive node actions
- **Questions** linked to flowchart nodes
- A **Reading Summary** with time-tracking heatmaps

### Architecture History

The project was originally a **fully client-side, offline-first application** using localStorage and IndexedDB for all data storage. In March 2025, it was migrated to a **client-server architecture** with:
- An Express.js backend serving a REST API
- SQLite (via `better-sqlite3`) for persistent storage
- File uploads stored on the server filesystem

**Theme preference** still uses client-side localStorage (see [Data Storage](#data-storage) below).

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
- **Express server** — runs on port 3001 (configurable via `PORT` env var). Also honors `SUITE_DATA_ROOT`: when set, data lives at `$SUITE_DATA_ROOT/scribe/` (`scribe.db`, `attachments/`); when unset it falls back **byte-for-byte** to the legacy in-repo `data/` (resolved in `server/db.ts`). Part of the suite data-centralization scheme.
- Vite proxies `/api/*` requests to the Express server (configured in `vite.config.ts`)
- `SCRIBE_SOURCE_ROOTS` (`:`-separated, default: the home directory) limits where folders may be linked from (see [Linked folders](#linked-folders)).

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
    attachments.ts           # Upload, download, list, delete attachments; kind/status/projects/enrichment/thumbnail
    annotations.ts           # PDF highlights and comments
    readingTime.ts           # Per-attachment reading time tracking
    viewerPrefs.ts           # Per-attachment PDF viewer preferences
    folders.ts               # Project (folder) management for library, incl. archive
    bookTags.ts              # Library (book) tag CRUD
    flowchartTags.ts         # Flowchart tag CRUD
    outlines.ts              # Custom PDF outlines (table of contents)
    flowcharts.ts            # Flowchart CRUD + metadata/tags + node index + node queries
    questions.ts             # Questions linked to flowchart nodes
    sources.ts               # Linked folders: CRUD, preview (dry run), rescan, SSE change events
  lib/
    kindGuess.ts             # Heuristic book/paper/draft/notes classifier (filename, page count, PDF metadata)
    sources.ts               # Linked folders: walk, reconcile scan, move detection, fs.watch, attachmentFilePath()
    excludePatterns.ts       # gitignore-style exclude patterns for linked folders
  scripts/
    migrate-flowcharts.ts    # One-time migration from old HTML flowcharts to SQLite

data/                        # Created at runtime, git-ignored
  scribe.db                  # SQLite database file
  attachments/               # Uploaded file blobs stored on disk
  thumbnails/                # First-page JPEG covers (<attachment id>.jpg), produced by client-side enrichment

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
    flowchart.ts             # FlowchartSpec, FlowchartNode, FlowchartEdge, etc.
    folder.ts                # Folder
    source.ts                # Source (linked folder), SourcePreview, ScanSummary
    crop.ts                  # Crop settings
  services/                  # Data access layer (calls REST API or localStorage)
    noteStorage.ts           # REST API → /api/notes
    attachmentStorage.ts     # REST API → /api/attachments (incl. kind, status, projects, enrichment, thumbnail URL)
    attachmentEnrichment.ts  # Client-side PDF/DjVu parse → page count, metadata, thumbnail → PUT enrichment
    annotationStorage.ts     # REST API → /api/annotations
    readingTimeStorage.ts    # REST API → /api/reading-time
    viewerPrefsStorage.ts    # REST API → /api/viewer-prefs (+ localStorage fallback)
    folderStorage.ts         # REST API → /api/folders
    sourceStorage.ts         # REST API → /api/sources (+ EventSource subscription to change events)
    outlineStorage.ts        # REST API → /api/outlines
    flowchartStorage.ts      # REST API → /api/flowcharts
    questionStorage.ts       # REST API → /api/questions
    themeStorage.ts          # localStorage (key: scribe_theme)
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
    useCustomOutline.ts
    useNow.ts                # Minute-refreshed "now" for relative dates without Date.now() in render
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
    BookCover/               # Thumbnail with typographic fallback + optional progress bar (shared by Library views)
    Icons/                   # SVG icon components
    ContextMenu/             # Reusable context menu
    PdfViewer/               # All PDF viewer sub-components (see below)
    NodeCard/                # Presentational flowchart node card, shared by renderer + editor
    FlowchartRenderer/       # React+SVG read-only renderer (nodes, arrows, BFS highlight)
    FlowchartCanvas/         # Pan/zoom editing canvas (drag+snap, auto-route, inspector, stage manager, undo)
  pages/                     # Route-level components
    Library/LibraryPage.tsx          # / — Home shelves or Browse (grid/list), selection, context menus, upload + drop
    Library/LibraryHome.tsx          #   Shelves: Continue reading, Projects, Recently added, one per kind
    Library/LibrarySidebar.tsx       #   Home / All / Projects (+archived) / Linked folders / Tags, with create/rename/archive/delete
    Library/LinkFolderDialog.tsx     #   Link/edit a folder on disk, with live preview and upload adoption
    Library/LibraryFilterBar.tsx     #   Kind + activity chips with counts, sort select (grid)
    Library/UploadTriage.tsx         #   "Just uploaded" strip: set kind/project/tags right after upload
    Library/libraryModel.ts          #   Selection/filter types, URL (de)serialisation, matching, sorting
    Library/useLibraryEnrichment.ts  #   Background one-at-a-time enrichment queue
    Notes/NotesPage.tsx              # /notes — list/filter/search notes
    Editor/EditorPage.tsx            # /note/new, /note/:id/edit
    View/ViewPage.tsx                # /note/:id (read-only)
    Flowcharts/FlowchartsPage.tsx    # /flowcharts — list + read-only detail viewer (?view=<id>)
    FlowchartEditor/FlowchartEditorPage.tsx  # /flowcharts/:id/edit — visual editor
    PdfViewer/PdfViewerPage.tsx      # /pdf/:attachmentId
    Questions/QuestionsPage.tsx      # /questions — review node questions
    Summary/SummaryPage.tsx          # /summary — reading time heatmap
```

### TypeScript Configuration

The project uses **TypeScript project references** with three configs:
- `tsconfig.app.json` — React app (ES2022, JSX)
- `tsconfig.server.json` — Node.js server (ES2023)
- `tsconfig.node.json` — Vite/build tooling
- `tsconfig.json` — References all three

---

## Data Storage

Nearly all data lives on the **server** (SQLite + filesystem). Only theme preference uses client-side localStorage.

### Server-side (SQLite database at `data/scribe.db`)

| Table | Key | Description |
|---|---|---|
| `notes` | `id` (TEXT) | Note content, tags (JSON), status, category, subject |
| `folders` | `id` (TEXT) | Library projects (name, `archived_at`) |
| `attachment_folders` | `(attachment_id, folder_id)` | M2M join of attachments ↔ projects; CASCADE on both sides. The legacy `attachments.folder_id` column is kept but no longer read. |
| `attachments` | `id` (TEXT) | File metadata; uploaded blobs stored at `data/attachments/`. Library columns: `kind`, `kind_manual`, `title`, `authors`, `year`, `page_count`, `status` ('done' or NULL), `thumbnail_path`, `enriched_at`. Linked-folder items set `source_id` + `rel_path` (unique together; `file_path` is `''`), `mtime_ms`, and `missing_at` when the file has vanished |
| `sources` | `id` (TEXT) | Linked folders: `root_path` (canonical, unique), `recursive`, `exclude` (JSON pattern list), `last_scan_at`, `offline_since`, `error` |
| `highlights` | `id` (TEXT) | PDF highlight rects (JSON), selected text, color; FK → attachments |
| `comments` | `id` (TEXT) | Annotation comments; FK → highlights, FK → attachments |
| `reading_time` | `(attachment_id, date_cst)` | Per-attachment daily reading seconds |
| `viewer_prefs` | `attachment_id` (TEXT) | Per-attachment PDF viewer settings (zoom, page, crop, etc.) |
| `custom_outlines` | `id` (TEXT) | User-created PDF table of contents entries; FK → attachments |
| `flowcharts` | `id` (TEXT) | Flowchart metadata + full spec JSON (`FlowchartSpec`) |
| `flowchart_nodes` | `id` (TEXT) | Denormalized node index rebuilt from spec on save; FK → flowcharts |
| `flowchart_tags` | `id` (TEXT) | User-defined flowchart tags (name unique, color) |
| `flowchart_tag_links` | `(flowchart_id, tag_id)` | M2M join of flowcharts ↔ tags; CASCADE on both sides |
| `book_tags` / `attachment_tags` | — | Library (book) tags + M2M join to attachments |
| `questions` | `id` (TEXT) | Questions linked to flowchart nodes by `node_id` + `flowchart_id` |

SQLite features enabled: WAL mode, foreign key constraints, CASCADE deletes.

### Client-side (localStorage)

| Key | Type | Contents |
|---|---|---|
| `scribe_theme` | string | `'default'` or `'dark'` |
| `scribe_ui_prefs` | JSON | Global UI preferences — currently `{ tocMode: 'panel' \| 'floating' }` (see `UiPrefsContext`) |
| `scribe_library_view` | string | Library Browse layout: `'grid'` or `'list'` |
| `scribe_library_columns` | JSON | Library list-view column widths in px, keyed by column (`title`, `kind`, `projects`, `tags`, `progress`, `opened`, `added`); see `useListColumns` |

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
- `GET /api/attachments` — list all attachments (joined with `viewer_prefs.current_page` → `currentPage`; includes `folderIds`, `kind`, `pageCount`, `hasThumbnail`, `enrichedAt`, …)
- `GET /api/attachments/:id` — single attachment with the same shape
- `GET /api/attachments/by-subject?subject=X` — filter by subject
- `GET /api/attachments/counts-by-subject` — aggregate attachment counts per subject
- `POST /api/attachments` — upload a file (multipart form data via multer)
- `GET /api/attachments/:id/blob` — download the file blob (managed or linked; `Content-Length` comes from `fs.stat`, not the `size` column)
- `PATCH /api/attachments/:id/subject` — update subject
- `PATCH /api/attachments/:id/filename` — rename file
- `PATCH /api/attachments/:id/last-opened` — mark as recently opened
- `PATCH /api/attachments/:id/title` — set display title (`''` clears, falls back to filename)
- `PATCH /api/attachments/:id/kind` — `{ kind }` sets a manual kind (`kind_manual = 1`); `{ kind: null }` returns to automatic guessing
- `PATCH /api/attachments/:id/status` — `{ status: 'done' | null }`
- `PUT /api/attachments/:id/folders` — replace the set of projects (`{ folderIds }`)
- `PUT /api/attachments/:id/tags` — replace the set of tags (`{ tagIds }`)
- `PUT /api/attachments/:id/enrichment` — `{ pageCount?, title?, authors?, year?, creator?, producer?, thumbnail? }` (thumbnail is a JPEG data URL). Stores metadata, writes `data/thumbnails/<id>.jpg`, sets `enriched_at`, and re-runs the kind guess unless the kind is manual
- `GET /api/attachments/:id/thumbnail` — first-page JPEG (immutable cache; client appends `?v=<enrichedAt>`)
- `DELETE /api/attachments/:id` — delete attachment (cascades to DB rows + filesystem). For a linked item: remove it from the library and add its path to the folder's excludes; the file on disk is never touched
- `PATCH /api/attachments/:id/filename` returns 409 for linked items (their name follows the file on disk)

### Annotations
- `GET /api/annotations/highlights?attachmentId=X` — list highlights for an attachment
- `POST /api/annotations/highlights` — create a highlight
- `DELETE /api/annotations/highlights/:id` — delete a highlight
- `GET /api/annotations/comments?highlightId=X` or `?attachmentId=X` — list comments
- `POST /api/annotations/comments` — create a comment
- `PATCH /api/annotations/comments/:id` — update comment text
- `DELETE /api/annotations/comments/:id` — delete a comment
- `DELETE /api/annotations/comments?highlightId=X` — batch delete comments by highlight

### Folders (projects)
- `GET|POST /api/folders`, `PATCH /api/folders/:id/name`, `PATCH /api/folders/:id/archived` (`{ archived }`), `DELETE /api/folders/:id`

### Linked folders (sources)
- `GET /api/sources` — list, with `itemCount`, `missingCount`, `highlightCount`, `offline`, `error`
- `POST /api/sources/preview` — `{ path, recursive?, exclude?, sourceId? }` dry run: documents found, uploads with identical content (`matches`), and when editing, how many linked items the settings would drop
- `POST /api/sources` — `{ name?, path, recursive?, exclude?, adoptIds? }` link + first scan; `adoptIds` are uploads to convert into the matching linked file
- `PATCH /api/sources/:id` — `{ name?, path?, recursive?, exclude? }` then rescan (items now excluded are removed)
- `POST /api/sources/:id/scan`, `POST /api/sources/scan` (all, throttled to one per folder per 10 s; `{ changed }`)
- `DELETE /api/sources/:id/missing` — remove items whose files are gone; `DELETE /api/sources/:id` — unlink (items leave the library; files untouched)
- `GET /api/sources/events` — server-sent events, `data: { sourceId }` after any change

### Reading Time
- `GET /api/reading-time` — all entries (optional `?start=DATE&end=DATE` filter)
- `POST /api/reading-time` — accumulate seconds for attachment + date
- `DELETE /api/reading-time` — clear all reading time data

### Flowcharts
- `GET /api/flowcharts` — list all (id, name, description, tags, dates — no spec)
- `GET /api/flowcharts/:id` — full record including spec JSON and tags
- `POST /api/flowcharts` — create from `{ name, description?, spec }`
- `PUT /api/flowcharts/:id` — full spec replacement (also updates name/description)
- `PATCH /api/flowcharts/:id` — partial metadata update (`{ name?, description? }`) without touching the spec
- `PUT /api/flowcharts/:id/tags` — replace the set of tags (`{ tagIds }`)
- `PATCH /api/flowcharts/:id/nodes/:nodeKey` — partial node update (position and/or content)
- `DELETE /api/flowcharts/:id` — delete + cascade
- `GET /api/flowcharts/:id/nodes` — list nodes for one flowchart (from index table)
- `GET /api/flowcharts/nodes/search?title=X` — search nodes across all flowcharts by title substring
- `GET /api/flowcharts/nodes/:flowchartId/:nodeKey` — get single node content

### Flowchart Tags / Book Tags
- `GET|POST /api/flowchart-tags`, `PATCH|DELETE /api/flowchart-tags/:id` — flowchart tag CRUD
- `GET|POST /api/book-tags`, `PATCH|DELETE /api/book-tags/:id` — library (book) tag CRUD

On POST and PUT, the route handler validates the spec, stores/updates the `flowcharts` row, then rebuilds the `flowchart_nodes` index from the spec's nodes array. On PATCH, it reads the spec, applies the partial update to the target node, writes back the spec, and updates the corresponding `flowchart_nodes` row.

### Questions
- `GET /api/questions` — list all questions
- `GET /api/questions/by-node?nodeId=X&flowchartId=Y` — questions for a specific node
- `GET /api/questions/counts-by-node?flowchartId=Y` — question counts per node
- `POST /api/questions` — create a question
- `PATCH /api/questions/:id/checked` — update checked state
- `DELETE /api/questions/:id` — delete a question

### Health
- `GET /api/health` — returns `{ status: 'ok', timestamp: ... }`

---

## Routing (Client-side)

| Path | Component | Description |
|---|---|---|
| `/` | `LibraryPage` | Home shelves by default; `?view=browse`, `?project=<id>`, `?tag=<id>`, `?source=<id>` open Browse, with optional `&kind=` / `&activity=` filters |
| `/notes` | `NotesPage` | Browse and filter notes |
| `/note/new` | `EditorPage` | Create new note (optional `?subject=` param) |
| `/note/:id/edit` | `EditorPage` | Edit existing note |
| `/note/:id` | `ViewPage` | Read-only note view |
| `/flowcharts` | `FlowchartsPage` | Flowchart list + read-only detail viewer (`?view=<id>`); "Edit" opens the editor |
| `/flowcharts/:id/edit` | `FlowchartEditorPage` | Full-screen visual editor (pan/zoom canvas, inspector, stage manager) |
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
- Flowcharts use programmatic color adjustment in dark mode (reduce lightness, increase saturation) on stage colors from the spec JSON.
- The PDF viewer uses `--color-pdf-bg` and `--pdf-highlight-blend` CSS variables that change between light (`multiply`) and dark (`screen`) modes.

### Service Layer Pattern

- Services are plain objects (not classes) exported as `const serviceName = { ... }`.
- **Server-backed services** (notes, attachments, annotations, reading time, viewer prefs, folders, outlines, flowcharts, questions) are async and use `fetch()` to call the REST API.
- **Client-only services** (theme) use localStorage and may be synchronous.
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

### Flowchart System

Flowcharts are stored in SQLite as `FlowchartSpec` JSON (nodes, edges, positions, stage colors) and rendered with a React+SVG component. The old iframe-based static HTML system has been fully replaced.

**Data model:** The `flowcharts` table stores the full spec JSON. The `flowchart_nodes` table is a denormalized index rebuilt from the spec whenever a flowchart is created or updated — it enables joins with notes/questions without parsing JSON, and powers cross-app node queries.

**Viewing vs editing are separate surfaces.** The `?view=<id>` detail panel is the read-only viewer (renderer + cross-app node actions); the dedicated `/flowcharts/:id/edit` route is the visual editor. Both render nodes through the shared presentational `NodeCard` so they never drift.

**Components:**
- `NodeCard` — presentational node card (title/divider/refs/topics with KaTeX + stage colors). Shared by renderer and canvas.
- `FlowchartRenderer` — read-only renderer. Nodes are positioned `NodeCard`s over an SVG arrow layer; arrows drawn imperatively in `useFlowchartArrows` (anchor + cubic-path math now lives in `src/utils/edgeGeometry.ts`). BFS highlight: click a node to highlight its ancestor chain with depth badges, dimming the rest.
- `FlowchartCanvas` — the editor canvas. Pan/zoom viewport (`useViewport`), drag-with-snap + alignment guides (`useDragSnap`), width-resize and drag-to-connect handles, a live React-rendered `EdgeLayer` (recomputes paths every frame), docked `Inspector` (node properties), `StageManager` (stages + chart settings with auto-generated palettes), and `useUndoRedo`. Edges are **auto-routed** via `src/utils/edgeRouting.ts` on any geometry change — there are no manual curve handles.

**Auto-routing & palettes:** `routeEdges()` picks anchors (spreading multiple edges off a node across fractional anchors) and Bézier control points from node geometry; the result is written back into `spec.edges`, so the stored schema stays concrete for LLM/automated round-trips. `generateStagePalette(accent)` in `colorUtils.ts` turns one accent hue into the full 7-role light-mode palette. **The `FlowchartSpec` schema is unchanged** — the editor and the `interactive-flowchart` skill produce the same JSON, and there were no server changes.

**Saving:** the editor keeps the spec in undo/redo state and debounces a full-spec `PUT` (`flowchartStorage.update`) ~800ms after any change, flushing on unmount. (The old per-node `PATCH` editing path was retired along with the old `FlowchartEditor`.)

**Node identification:** The node `id` field (e.g., `"qsvt"`, `"linalg"`) is the stable cross-app reference key (`node_key`). Notes, attachments, and questions link to nodes via `node_key`, not the display title.

Node actions supported: `write-note`, `attach-file`, `view-attachments`, `view-notes`, `add-question`.

### Library Organisation

Three independent axes, each answering a different question, replace the single folder tree:

- **Kind** — what it is: `book | paper | draft | notes | other`, or unset ("Unsorted"). Guessed by `server/lib/kindGuess.ts` from filename at upload and again after enrichment (page count ≥120 → book, ≤60 → paper, TeX-produced snake_case small file with no metadata title → draft, "slides"/"notes"/arXiv ids etc.). A kind set by hand (`kind_manual`) is never overwritten; guessed kinds render in italics.
- **Project** — what it's for: the `folders` table, now many-to-many via `attachment_folders`, with `archived_at`. Labelled "Projects" throughout the UI. Nothing is hidden from "All items" because it belongs to a project (the old "Default" bucket is gone).
- **Activity** — where the reader stands, derived in `src/utils/libraryActivity.ts` with zero input: `done` (manual status) · `reading` (opened ≤14 days) · `paused` · `dormant` (≥180 days) · `unopened`. Progress = `viewer_prefs.current_page / page_count`.

Tags and flowchart-node links are unchanged (topics and curriculum respectively).

**Enrichment** (`src/services/attachmentEnrichment.ts`): the server never parses PDFs. The browser, which already ships pdf.js, reads page count, `Title`/`Author`/`CreationDate`/`Creator`/`Producer`, renders page 1 at 240 px wide to a JPEG, and `PUT`s it to `/enrichment`. Two triggers: `useLibraryEnrichment` back-fills un-enriched items one at a time while the Library is open (most recently opened first; an "Indexing n/m" badge shows in the header), and `OpenBooksContext` enriches from the already-loaded document when a PDF is opened in the viewer. A file that fails to parse is still marked enriched (empty payload) so it is not retried every session.

### Linked folders

A linked folder ("source") is a directory on the server's disk whose PDFs/DjVu files are tracked **in place** — one-way, disk → library; nothing on disk is ever modified. Its items are ordinary attachments (kinds, projects, tags, annotations all work) with `source_id` + `rel_path`. All logic is in `server/lib/sources.ts`:

- **Reconcile scan is the only writer.** Triggers: server start-up, the Library page opening (`POST /api/sources/scan`), a manual Rescan, and a debounced (1 s) scan after `fs.watch` events. Watchers are one non-recursive `fs.watch` per visited directory, so skipped trees cost no inotify watches; events for non-document files are ignored. Clients refresh via the SSE stream.
- **Identity = relative path.** Size + mtime decide whether to re-hash. Same path, new sha256 → content changed: `enriched_at` is cleared so the client re-reads page count/metadata/cover (the enrichment queue keys attempts by `id@fileModifiedAt`). A vanished path + a new path with the same sha256 in one scan → a move (same id, annotations kept).
- **Never deleted because a file vanished** (highlights etc. CASCADE): it gets `missing_at` and shows dimmed ("Missing"), hidden from Home shelves. An unreachable root — or a completely empty one that had files (an unmounted mount point) — marks the source `offline` and leaves its items alone. Items are deleted only when the user excludes them (pattern, subfolders off, "Remove from library"), removes missing items, or unlinks the folder.
- **Half-written files** (pdflatex truncates, then rewrites) are skipped until their mtime is ≥2 s old *and* the PDF ends in `%%EOF` (or ≥60 s old); a rescan is scheduled meanwhile.
- **Walk rules:** `.pdf`/`.djvu` only; hidden entries, `node_modules`, `__pycache__` always skipped; symlinked directories not followed; gitignore-style excludes (`figures/`, `*_plot.pdf`, `/anchored.pdf`, `**`); limits of 20k directories / 5k documents.
- **Adoption:** linking previews uploads with identical content (sizes compared first, then sha256); ticked ones are converted in place — same id, so annotations/tags/projects/progress survive — and the managed copy is deleted.
- **Safety:** a root must be inside `SCRIBE_SOURCE_ROOTS` (default `~`), must not overlap another source or the data dir, and only files found by the walk are served (paths are re-checked to lie inside the root).

**Library UI:** Home (shelves: Continue reading, Projects with drop-to-upload cards, Recently added, one shelf per kind, Unsorted) vs Browse (cover grid or table, kind/activity chips with counts, search across title/filename/authors/tag/project names). Selection and filters live in the URL so Back from the viewer restores the view. The **Upload triage** strip appears after any upload (button or drag-and-drop) to set kind/project/tags while context is fresh. Right-click: Set kind…, Projects… (toggle membership), Mark as done, Rename (sets display `title`, leaves the filename alone).

### Note Model

```ts
interface Note {
  id: string;
  title: string;
  content: string;       // Markdown
  tags: string[];
  status: 'draft' | 'published';
  category?: string;
  subject?: string;      // Links notes to flowchart nodes (via node_key) / attachment subjects
  attachmentId?: string; // Links note to a specific attachment (book)
  page?: number;         // Page number within that attachment
  createdAt: string;     // ISO 8601
  updatedAt: string;     // ISO 8601
}
```

Notes support **LaTeX** in the Markdown editor (same convention as Granary):
- Inline: `$expression$`
- Display: `$$expression$$` (on its own lines)

Rendering uses `remark-math` + `rehype-katex` plugins with `@uiw/react-md-editor`.

### PDF Viewer

The PDF viewer (`PdfViewerPage`) composes multiple sub-components:
- `PdfToolbar` — zoom, fit-width, TOC toggle, right panel toggle
- `PdfSidebar` — table of contents from PDF outline. Two layouts, chosen globally in Settings → Viewer (`tocMode`): **panel** docks it beside the document (opening it narrows the page area, so pages re-render at a new fit-width zoom), **floating** overlays it on the page area, leaving the document's width — and its rendering — untouched. Floating mode renders the same component inside `.pdfArea` with `position: absolute` and carries its own close button, since it covers the corner TOC toggle.
- `PdfDocumentView` — scrollable virtualized page list (via `usePdfDocument`)
- `PdfRightPanel` — highlights, comments, and related notes panel
- `PdfSelectionToolbar` — floating toolbar on text selection (highlight / highlight + comment)
- `PdfCommentPopover` — popover for viewing/editing comments on a highlight
- `PdfHighlightLayer` — renders highlight rectangles over PDF pages
- `PdfCropOverlay` — full-page manual crop editor (drag edges, separate odd/even boxes, "Auto-detect")

Viewer preferences (zoom, fit-width, current page) are saved per-attachment to `viewerPrefsStorage` with a 1 s debounce and immediately on `beforeunload`.

### Page Trimming

The toolbar's crop button opens a **Trim view** menu modelled on Okular's `View → Trim View`: automatic and manual trimming are alternatives, never both.

The mode lives in `TrimMode` (`src/types/crop.ts`) and is persisted per attachment in the `trim_mode` column.

- **Trim margins** (`uniform`, the automatic default) — `useAutoTrim` measures 24 pages spread through the document, once, then applies a single box to every page. `unifyCrops()` keeps a per-parity left/right (books alternate their gutter) but equalises the trimmed dimensions, so every page renders at exactly the same size and nothing shifts while scrolling. Per side it takes the smallest margin among the *typical* pages (`typicalMin` discards anything under half the median), so a few full-bleed or decorative pages can't drag the crop back open, while no ordinary page gets clipped.
- **Trim margins (per page)** (`page`) — Okular's literal behaviour: each page trimmed to its own content box, measured lazily around the reading position. Best for scans whose content wanders; pages then differ in size.
- **Manual crop** (`off` + `crop_*` columns) — the `PdfCropOverlay` odd/even `CropBox`es. Retained while automatic trimming is on, so switching it off restores them.

Detection lives in `src/utils/autoTrim.ts`: the page is rendered small, background luminance is estimated from the border ring, and the ink bounding box is taken with an erosion + row/column ink gate so margin specks on scans don't defeat it. Pages that measure untrustworthy (blank, a lone page number) are skipped rather than trusted. Measured boxes are in-memory only.

All modes feed `PdfDocumentView` through one `cropForPage(pageNumber)` resolver, which drives both page layout (`buildLayoutModel`) and rendering. Fit-width always uses the document-wide box so zoom can't jitter. Export applies the same resolver — in `uniform` mode it needs only the 24-page sample, in `page` mode it measures every page first (with a % readout in the toolbar).

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

Two paths, both producing the same `FlowchartSpec`:

- **Visually (humans):** "New Flowchart" on the Flowcharts page → pick a template (Blank / roadmap) → opens the visual editor (`/flowcharts/:id/edit`). Add stages (auto palettes), double-click the canvas to add nodes, drag the blue handle to connect, edit in the inspector. No JSON required.
- **As JSON (Claude / automation):** generate a `FlowchartSpec` per the schema in `src/types/flowchart.ts` (the `interactive-flowchart` skill is the layout reference), then either "Import JSON" on the list page, `POST /api/flowcharts` with `{ name, description?, spec }`, or paste it into the editor's **JSON** drawer ("Apply to chart"). Use Markdown for refs (`*italic*`, not `<em>`), `$...$` for inline KaTeX, and semantic short node IDs (e.g. `"linalg"`, `"qsvt"`) since they're the cross-app `node_key`.

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

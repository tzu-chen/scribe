# Scribe - CLAUDE.md

## Project Overview

Scribe is a browser-based study tool built with React 19, TypeScript, and Vite. It is a **fully client-side, offline-first application** — all data is stored in the browser (localStorage and IndexedDB) with no backend or API calls. The app helps users manage:

- A **Library** of uploaded PDF and other files
- **Notes** written in Markdown with LaTeX support
- **Flowcharts** (static HTML files served from `/public/flowchart/`) with interactive node actions
- **Questions** linked to flowchart nodes
- A **Reading Summary** with time-tracking heatmaps

---

## Development Commands

```bash
npm run dev      # Start Vite dev server (HMR)
npm run build    # TypeScript check + Vite production build
npm run lint     # ESLint
npm run preview  # Preview the production build locally
```

There are **no tests** in this project currently.

---

## Architecture

### Tech Stack

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

### Directory Structure

```
src/
  App.tsx                  # Root: router + ThemeProvider + Layout
  main.tsx                 # React entry point
  global.css               # CSS custom properties (design tokens), reset
  types/                   # TypeScript interfaces (no logic)
    note.ts                # Note, NoteStatus
    attachment.ts          # Attachment, AttachmentMeta
    annotation.ts          # PdfHighlight, PdfComment, HighlightRect
    question.ts            # Question
    readingTime.ts         # ReadingTimeEntry, ReadingTimeMap
  services/                # Storage layer (pure functions / objects, no React)
    noteStorage.ts         # localStorage (key: scribe_notes)
    attachmentStorage.ts   # IndexedDB (scribe_attachments)
    annotationStorage.ts   # IndexedDB (scribe_annotations)
    questionStorage.ts     # localStorage (key: scribe_questions)
    readingTimeStorage.ts  # localStorage (key: scribe_reading_time)
    themeStorage.ts        # localStorage (key: scribe_theme)
    viewerPrefsStorage.ts  # localStorage (key: scribe_viewer_prefs)
  hooks/                   # Custom React hooks (wrap services + React state)
    useNotes.ts
    useAutoSave.ts
    useCategories.ts
    useTags.ts
    useSubjects.ts
    usePdfDocument.ts
    usePdfAnnotations.ts
    useReadingTimeTracker.ts
    useReadingSummary.ts
  contexts/
    ThemeContext.tsx        # Theme ('default' | 'dark'), reads/writes themeStorage
  components/              # Reusable UI components
    Layout/                # App shell: header nav + main content area
    NoteEditor/            # @uiw/react-md-editor wrapper with KaTeX support
    NoteCard/              # Note list item
    NoteToolbar/           # Save/publish/delete toolbar
    TagInput/              # Tag chip input
    TagFilter/             # Tag filter chips
    CategorySelect/        # Category autocomplete input
    SearchBar/             # Search input
    ThemeMenu/             # Light/dark toggle
    BookPicker/            # Modal for picking an existing attachment
    PdfViewer/             # All PDF viewer sub-components (see below)
  pages/                   # Route-level components
    Library/LibraryPage.tsx        # / — upload and browse attachments
    Notes/NotesPage.tsx            # /notes — list/filter/search notes
    Editor/EditorPage.tsx          # /note/new, /note/:id/edit
    View/ViewPage.tsx              # /note/:id (read-only)
    Flowcharts/FlowchartsPage.tsx  # /flowcharts — flowchart picker + iframe viewer
    PdfViewer/PdfViewerPage.tsx    # /pdf/:attachmentId
    Questions/QuestionsPage.tsx    # /questions — review node questions
    Summary/SummaryPage.tsx        # /summary — reading time heatmap
public/
  flowchart/
    flowchart-integration.js  # Injected into flowchart iframes at runtime
    flowchart-theme.css        # Theme CSS injected into flowchart iframes
    flowchart-interactive.html # Example flowchart structure
    index.json                 # Flowchart manifest (loaded by FlowchartsPage)
```

---

## Data Storage

All data is stored **client-side only**. No data leaves the browser.

### localStorage keys

| Key | Type | Contents |
|---|---|---|
| `scribe_notes` | JSON array | `Note[]` |
| `scribe_questions` | JSON array | `Question[]` |
| `scribe_reading_time` | JSON object | `ReadingTimeMap` (keyed `attachmentId::dateCST`) |
| `scribe_theme` | string | `'default'` or `'dark'` |
| `scribe_viewer_prefs` | JSON object | `Record<attachmentId, ViewerPrefs>` |

### IndexedDB databases

| Database | Store(s) | Key | Indexes |
|---|---|---|---|
| `scribe_attachments` (v1) | `attachments` | `id` | `by_subject` |
| `scribe_annotations` (v1) | `highlights`, `comments` | `id` | `by_attachment`, `by_highlight` |

- Attachment binary data (`Blob`) is stored directly in IndexedDB — no server upload.
- `AttachmentMeta` (metadata without the `data` blob) is the type used for listing.

---

## Routing

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
- Services are synchronous for localStorage and async/Promise-based for IndexedDB.
- Services do **not** use React hooks.
- Hooks wrap services and expose React state + callbacks.

### Auto-save

`useAutoSave` debounces note saves with a 1500 ms delay. It compares a serialized "noteKey" string to detect actual changes and avoid spurious saves. The editor page uses `useMemo` keyed on specific fields to construct the note object passed to `useAutoSave`, preventing unnecessary effect runs.

### Reading Time Tracking

`useReadingTimeTracker` tracks active reading time per attachment per CST calendar date:
- Accumulates seconds via a 1 s tick interval (capped at 2 s per tick to handle tab switches).
- Detects idleness after 60 s of no user activity (`mousemove`, `keydown`, `scroll`, etc.) and pauses accumulation.
- Flushes to `readingTimeStorage` every 30 s and on page unload / tab hide.
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

## Adding a New Storage Key

1. Add the type to `src/types/`.
2. Create `src/services/newStorage.ts` following the existing service pattern.
3. Create a hook in `src/hooks/` if React components need to consume it.

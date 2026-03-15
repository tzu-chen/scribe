# Scribe

A browser-based study tool for managing PDFs, notes, flowcharts, and reading time — built with React 19 + TypeScript on the frontend and Express + SQLite on the backend.

## Features

- **Library** — Upload and browse PDF files and other documents
- **Notes** — Write notes in Markdown with LaTeX math support
- **Flowcharts** — Interactive flowcharts with node-linked actions (notes, attachments, questions)
- **Questions** — Create and review questions linked to flowchart nodes
- **Reading Summary** — Track reading time with daily heatmaps and charts

## Architecture

Scribe uses a **client-server architecture**:

- **Frontend**: React 19 SPA built with Vite, using CSS Modules for styling and React Router for navigation
- **Backend**: Express 5 REST API with SQLite (via `better-sqlite3`) for persistent storage
- **File storage**: Uploaded files stored on the server filesystem (`data/attachments/`)
- **Client-only storage**: Theme preference, viewer preferences, and questions use localStorage

In development, Vite proxies `/api/*` requests to the Express server. In production, Express serves both the API and the built React app.

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm

### Install & Run

```bash
npm install
npm run dev
```

This starts both the Vite dev server (with HMR) and the Express API server concurrently. The app will be available at `http://localhost:5173`.

### Production

```bash
npm run build
npm run start
```

The Express server serves the built app from `dist/` and handles API requests on port 3001 (configurable via `PORT` env var).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start client + server concurrently (development) |
| `npm run dev:client` | Start Vite dev server only |
| `npm run dev:server` | Start Express server only (with auto-reload) |
| `npm run build` | TypeScript check + Vite production build |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build (client only) |
| `npm run start` | Start production server |

## Tech Stack

**Frontend**: React 19, TypeScript, Vite, React Router, CSS Modules, pdfjs-dist, KaTeX, Recharts

**Backend**: Express 5, better-sqlite3, multer

## Project Structure

```
server/           # Express API server
  index.ts        # App setup, CORS, static serving
  db.ts           # SQLite schema and initialization
  routes/         # API route handlers (notes, attachments, annotations, etc.)

src/              # React frontend
  pages/          # Route-level page components
  components/     # Reusable UI components
  services/       # Data access (REST API calls + localStorage)
  hooks/          # Custom React hooks
  contexts/       # React contexts (theme)
  types/          # TypeScript interfaces

data/             # Runtime data (git-ignored)
  scribe.db       # SQLite database
  attachments/    # Uploaded files

public/
  flowchart/      # Static flowchart HTML files + integration scripts
```

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation, conventions, and API endpoint reference.

import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';

interface FlowchartEntry {
  id: string;
  name: string;
  filename: string;
  description?: string;
}

const FLOWCHART_DIR = 'public/flowchart';
const MANIFEST_FILE = 'public/flowchart/index.json';
const SKIP_FILES = new Set([
  'flowchart-integration.js',
  'flowchart-theme.js',
  'flowchart-theme.css',
  'index.json',
]);

function extractMetadata(filePath: string): { title: string; description?: string } | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const titleMatch = content.match(/<title>(.*?)<\/title>/i);
  if (!titleMatch) return null;

  const title = titleMatch[1].trim();
  const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']\s*\/?>/i);
  const description = descMatch?.[1]?.trim();

  return { title, description };
}

function generateManifest(): void {
  const dir = path.resolve(FLOWCHART_DIR);
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.html') && !SKIP_FILES.has(f));
  files.sort();

  const flowcharts: FlowchartEntry[] = [];

  for (const filename of files) {
    const meta = extractMetadata(path.join(dir, filename));
    const id = filename.replace(/\.html$/, '');

    flowcharts.push({
      id,
      name: meta?.title ?? id,
      filename,
      ...(meta?.description ? { description: meta.description } : {}),
    });
  }

  const manifest = JSON.stringify({ flowcharts }, null, 2) + '\n';
  const existing = fs.existsSync(MANIFEST_FILE) ? fs.readFileSync(MANIFEST_FILE, 'utf-8') : '';

  if (manifest !== existing) {
    fs.writeFileSync(MANIFEST_FILE, manifest);
    console.log(`[flowchart-manifest] Generated index.json with ${flowcharts.length} flowchart(s)`);
  }
}

export default function flowchartManifestPlugin(): Plugin {
  return {
    name: 'flowchart-manifest',

    buildStart() {
      generateManifest();
    },

    configureServer(server) {
      generateManifest();

      const dir = path.resolve(FLOWCHART_DIR);
      server.watcher.add(dir);
      server.watcher.on('all', (event, filePath) => {
        if (!filePath.startsWith(dir)) return;
        const basename = path.basename(filePath);
        if (SKIP_FILES.has(basename) || basename === 'index.json') return;
        if (!basename.endsWith('.html')) return;

        if (event === 'add' || event === 'unlink' || event === 'change') {
          generateManifest();
        }
      });
    },
  };
}

// Copies pdf.js's WASM decoders (and their JS fallback + licenses) from the
// installed pdfjs-dist package into public/pdf-wasm/ so Vite serves them.
//
// Why this is needed: pdf.js 5.x decodes JPEG 2000 (JPX) and JBIG2 images, and
// does ICC color management, in WebAssembly rather than pure JS. The worker
// fetches these modules from the directory given by the `wasmUrl` option to
// getDocument (see src/services/documentLoader.ts). Without them, any PDF that
// uses a JPEG 2000 / JBIG2 image renders that image blank while text/vector
// content is unaffected. The files are NOT bundled by Vite automatically (no
// module imports them), so we stage them into public/ ourselves.
//
// Kept in sync automatically: this runs on `postinstall`, so a pdfjs-dist
// upgrade re-copies the matching wasm. public/pdf-wasm/ is git-ignored.

import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Resolve the installed pdfjs-dist location robustly (handles hoisting).
const require = createRequire(pathToFileURL(join(projectRoot, 'package.json')));
const pkgJsonPath = require.resolve('pdfjs-dist/package.json');
const srcDir = join(dirname(pkgJsonPath), 'wasm');
const destDir = join(projectRoot, 'public', 'pdf-wasm');

if (!existsSync(srcDir)) {
  console.error(`[copy-pdf-wasm] source wasm dir not found: ${srcDir}`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const name of readdirSync(srcDir)) {
  const from = join(srcDir, name);
  if (!statSync(from).isFile()) continue;
  const to = join(destDir, name);
  // Skip unchanged files so repeated dev/build runs stay quiet and fast.
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  copyFileSync(from, to);
  copied++;
}

console.log(
  copied > 0
    ? `[copy-pdf-wasm] copied ${copied} file(s) to public/pdf-wasm/`
    : '[copy-pdf-wasm] public/pdf-wasm/ already up to date',
);

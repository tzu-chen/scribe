/**
 * One-time migration script: parse static HTML flowcharts from public/flowchart/
 * and insert them into the SQLite database.
 *
 * Run: npx tsx server/scripts/migrate-flowcharts.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLOWCHART_DIR = path.resolve(__dirname, '..', '..', 'public', 'flowchart');

// Import db after it initializes tables
const { db } = await import('../db.ts');

// ─── Types ───

interface ParsedNode {
  id: string;
  stageKey: string;
  title: string;
  badge?: { text: string; style: string };
  refs?: string;
  topics?: string;
  x: number;
  y: number;
  width: number;
}

interface ParsedStage {
  key: string;
  label: string;
  labelPosition: { x: number; y: number };
  colors: {
    background: string;
    border: string;
    title: string;
    divider: string;
    refs: string;
    topics: string;
    labelText: string;
  };
}

interface ParsedEdge {
  from: string;
  to: string;
  fromAnchor: string;
  toAnchor: string;
  controlPoints: { c1: [number, number]; c2: [number, number] };
  style: 'primary' | 'secondary';
}

interface ParsedFlowchart {
  title: string;
  subtitle?: string;
  width: number;
  height: number;
  stages: ParsedStage[];
  nodes: ParsedNode[];
  edges: ParsedEdge[];
}

// ─── Parsing helpers ───

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function convertHtmlToMarkdown(html: string): string {
  // Convert <em>...</em> to *...* and decode entities
  return decodeHtmlEntities(html.replace(/<em>(.*?)<\/em>/g, '*$1*').trim());
}

function parseNodes(content: string): ParsedNode[] {
  const nodes: ParsedNode[] = [];
  // Match: <div class="node cN" id="..." style="left:...;top:...;width:...;[extra styles]">
  const nodeRegex = /<div\s+class="node\s+(c\d+)"\s+id="([^"]+)"\s+style="left:(\d+)px;top:(\d+)px;width:(\d+)px;[^"]*">/g;
  let match;

  while ((match = nodeRegex.exec(content)) !== null) {
    const stageKey = match[1];
    const id = match[2];
    const x = parseInt(match[3], 10);
    const y = parseInt(match[4], 10);
    const width = parseInt(match[5], 10);

    // Find the node's content block (up to next </div> that closes the node)
    const startIdx = match.index;
    // Find the closing sequence: we know the structure is regular
    // The node div contains: depth-badge div, node-title div, node-div div, optional refs div, optional topics div
    // Find content up to a reasonable end point
    const chunk = content.substring(startIdx, startIdx + 2000);

    // Parse title (may contain badge span)
    const titleMatch = chunk.match(/<div class="node-title">(.*?)<\/div>/);
    let title = '';
    let badge: { text: string; style: string } | undefined;

    if (titleMatch) {
      let rawTitle = titleMatch[1];
      // Extract badge: <span class="badge seminal">SEMINAL</span>
      const badgeMatch = rawTitle.match(/<span\s+class="badge\s+(\w+)">(.*?)<\/span>/);
      if (badgeMatch) {
        badge = { text: badgeMatch[2], style: badgeMatch[1] };
        rawTitle = rawTitle.replace(badgeMatch[0], '').trim();
      }
      title = decodeHtmlEntities(rawTitle.trim());
    }

    // Parse refs
    const refsMatch = chunk.match(/<div class="node-refs">(.*?)<\/div>/);
    const refs = refsMatch ? convertHtmlToMarkdown(refsMatch[1]) : undefined;

    // Parse topics
    const topicsMatch = chunk.match(/<div class="node-topics">(.*?)<\/div>/);
    const topics = topicsMatch ? topicsMatch[1].trim() : undefined;

    nodes.push({ id, stageKey, title, badge, refs, topics, x, y, width });
  }

  return nodes;
}

function parseStages(content: string): ParsedStage[] {
  const stages: ParsedStage[] = [];

  // Parse stage labels: <div class="stage-lbl" style="left:30px;top:80px;color:#9a6010;">Stage 0 — Algebra Foundations</div>
  const stageLblRegex = /<div\s+class="stage-lbl"\s+style="left:(\d+)px;top:(\d+)px;color:(#[0-9a-fA-F]+);">(.*?)<\/div>/g;
  let match;

  while ((match = stageLblRegex.exec(content)) !== null) {
    const x = parseInt(match[1], 10);
    const y = parseInt(match[2], 10);
    const labelColor = match[3];
    const label = match[4].trim();

    // The stage index is derived from the label text — "Stage 0", "Stage 1", etc.
    const stageIdxMatch = label.match(/Stage\s+(\d+)/i);
    const stageIdx = stageIdxMatch ? parseInt(stageIdxMatch[1], 10) : stages.length;
    const key = `c${stageIdx}`;

    // Parse CSS colors for this stage class from the <style> block
    const colors = parseStageColors(content, key);

    stages.push({
      key,
      label,
      labelPosition: { x, y },
      colors: {
        ...colors,
        labelText: labelColor,
      },
    });
  }

  return stages;
}

function parseStageColors(content: string, stageClass: string): {
  background: string;
  border: string;
  title: string;
  divider: string;
  refs: string;
  topics: string;
} {
  const defaults = {
    background: '#f8f8f0',
    border: '#c0c0b0',
    title: '#333',
    divider: '#c0c0b0',
    refs: '#666',
    topics: '#666',
  };

  // .c0{background:#fdf3e3;border:1.2px solid #d4a650;}
  const bgBorderMatch = content.match(
    new RegExp(`\\.${stageClass}\\{background:(#[0-9a-fA-F]+);border:[^#]*(#[0-9a-fA-F]+);\\}`),
  );
  if (bgBorderMatch) {
    defaults.background = bgBorderMatch[1];
    defaults.border = bgBorderMatch[2];
  }

  // .c0 .node-title{color:#7a4a10;}
  const titleMatch = content.match(
    new RegExp(`\\.${stageClass} \\.node-title\\{color:(#[0-9a-fA-F]+);\\}`),
  );
  if (titleMatch) defaults.title = titleMatch[1];

  // .c0 .node-div{background:#d4a650;}
  const divMatch = content.match(
    new RegExp(`\\.${stageClass} \\.node-div\\{background:(#[0-9a-fA-F]+);\\}`),
  );
  if (divMatch) defaults.divider = divMatch[1];

  // .c0 .node-refs{color:#7a5a30;}
  const refsMatch = content.match(
    new RegExp(`\\.${stageClass} \\.node-refs\\{color:(#[0-9a-fA-F]+);\\}`),
  );
  if (refsMatch) defaults.refs = refsMatch[1];

  // .c0 .node-topics{color:#8a6a50;} (per-stage, optional)
  const topicsMatch = content.match(
    new RegExp(`\\.${stageClass} \\.node-topics\\{color:(#[0-9a-fA-F]+);\\}`),
  );
  if (topicsMatch) {
    defaults.topics = topicsMatch[1];
  } else {
    // Fall back to global .node-topics color
    const globalTopicsMatch = content.match(/\.node-topics\{[^}]*color:(#[0-9a-fA-F]+)/);
    if (globalTopicsMatch) defaults.topics = globalTopicsMatch[1];
  }

  return defaults;
}

function parseEdges(content: string): ParsedEdge[] {
  const edges: ParsedEdge[] = [];

  // Match addP calls (with or without spaces between arguments):
  // addP(svg,cub(ga('s0-logic','b80'),ga('s0-group','t20'),40,50,-40,-50),'s0-logic','s0-group');
  // addP(svg, cub(ga('emb','b70'), ga('seq2seq','t20'), 20,40, -30,-40), 'emb','seq2seq');
  // addP(svg, cub(...), 'from','to', dim);  — dim is a variable for secondary style
  const edgeRegex = /addP\(svg,\s*cub\(ga\('([^']+)','([^']+)'\),\s*ga\('([^']+)','([^']+)'\),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\),\s*'([^']+)'\s*,\s*'([^']+)'(?:\s*,\s*(?:\{([^}]*)\}|(\w+)))?\)/g;
  let match;

  while ((match = edgeRegex.exec(content)) !== null) {
    const fromId = match[1];
    const fromAnchor = match[2];
    const toId = match[3];
    const toAnchor = match[4];
    const c1x = parseFloat(match[5]);
    const c1y = parseFloat(match[6]);
    const c2x = parseFloat(match[7]);
    const c2y = parseFloat(match[8]);
    // match[9] and match[10] are the from/to repeated as string args
    const opts = match[11] || '';
    const varName = match[12] || '';

    // Determine if secondary: has d:'...' option (dashed) or a variable name like 'dim'
    const isSecondary = /d:'/.test(opts) || varName === 'dim';

    edges.push({
      from: fromId,
      to: toId,
      fromAnchor,
      toAnchor,
      controlPoints: {
        c1: [c1x, c1y],
        c2: [c2x, c2y],
      },
      style: isSecondary ? 'secondary' : 'primary',
    });
  }

  return edges;
}

function parseChartMetadata(content: string): { title: string; subtitle?: string; width: number; height: number } {
  // #chart{position:relative;width:1560px;height:3100px;...}
  const sizeMatch = content.match(/#chart\{[^}]*width:(\d+)px;height:(\d+)px/);
  const width = sizeMatch ? parseInt(sizeMatch[1], 10) : 1560;
  const height = sizeMatch ? parseInt(sizeMatch[2], 10) : 3000;

  // <div class="chart-title"><h1>...</h1><p>...</p></div>
  const titleMatch = content.match(/<div class="chart-title">\s*<h1>(.*?)<\/h1>/);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

  const subtitleMatch = content.match(/<div class="chart-title">.*?<p>(.*?)<\/p>/s);
  const subtitle = subtitleMatch ? subtitleMatch[1].trim() : undefined;

  return { title, subtitle, width, height };
}

function parseFlowchartHtml(content: string): ParsedFlowchart {
  const metadata = parseChartMetadata(content);
  const stages = parseStages(content);
  const nodes = parseNodes(content);
  const edges = parseEdges(content);

  return { ...metadata, stages, nodes, edges };
}

// ─── Database insertion ───

const insertFlowchart = db.prepare(`
  INSERT INTO flowcharts (id, name, description, spec, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const deleteFlowchartNodes = db.prepare('DELETE FROM flowchart_nodes WHERE flowchart_id = ?');

const insertFlowchartNode = db.prepare(`
  INSERT INTO flowchart_nodes (id, flowchart_id, node_key, title, refs, topics, stage_key)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function insertFlowchartData(
  name: string,
  description: string | undefined,
  parsed: ParsedFlowchart,
): string {
  const id = uuidv4();
  const now = new Date().toISOString();

  const spec = {
    version: 1 as const,
    title: parsed.title,
    subtitle: parsed.subtitle,
    width: parsed.width,
    height: parsed.height,
    stages: parsed.stages,
    nodes: parsed.nodes,
    edges: parsed.edges,
  };

  const txn = db.transaction(() => {
    insertFlowchart.run(id, name, description ?? null, JSON.stringify(spec), now, now);

    deleteFlowchartNodes.run(id);
    for (const node of parsed.nodes) {
      insertFlowchartNode.run(
        `${id}:${node.id}`,
        id,
        node.id,
        node.title,
        node.refs ?? null,
        node.topics ?? null,
        node.stageKey,
      );
    }
  });
  txn();

  return id;
}

// ─── Re-link notes ───

function relinkNotes(flowchartId: string, nodes: ParsedNode[]) {
  // Build a map of node title → node key
  const titleToKey = new Map<string, string>();
  for (const node of nodes) {
    titleToKey.set(node.title, node.id);
  }

  // Find notes whose subject matches a node title
  const allNotes = db.prepare('SELECT id, subject FROM notes WHERE subject IS NOT NULL').all() as Array<{ id: string; subject: string }>;

  let relinked = 0;
  const updateStmt = db.prepare('UPDATE notes SET subject = ? WHERE id = ?');
  for (const note of allNotes) {
    const nodeKey = titleToKey.get(note.subject);
    if (nodeKey && note.subject !== nodeKey) {
      updateStmt.run(nodeKey, note.id);
      relinked++;
    }
  }

  if (relinked > 0) {
    console.log(`  Re-linked ${relinked} note(s) from title to node_key for flowchart ${flowchartId}`);
  }
}

// ─── Main ───

function main() {
  console.log('Migrating flowcharts from public/flowchart/ to SQLite...\n');

  if (!fs.existsSync(FLOWCHART_DIR)) {
    console.error(`Flowchart directory not found: ${FLOWCHART_DIR}`);
    process.exit(1);
  }

  // Check if any flowcharts already exist in the database
  const existingCount = (db.prepare('SELECT COUNT(*) as count FROM flowcharts').get() as { count: number }).count;
  if (existingCount > 0) {
    console.log(`Database already contains ${existingCount} flowchart(s). Skipping migration.`);
    console.log('To re-run, delete existing flowcharts first.');
    return;
  }

  const htmlFiles = fs.readdirSync(FLOWCHART_DIR).filter(f => f.endsWith('.html'));
  console.log(`Found ${htmlFiles.length} HTML file(s) to migrate.\n`);

  const results: Array<{ file: string; id: string; name: string; nodes: number; edges: number }> = [];

  for (const filename of htmlFiles) {
    const filePath = path.join(FLOWCHART_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf-8');

    console.log(`Processing ${filename}...`);

    const parsed = parseFlowchartHtml(content);

    // Use the HTML <title> as the name
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    const name = titleMatch ? titleMatch[1].trim() : filename.replace('.html', '');

    // Use <meta name="description"> if present
    const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
    const description = descMatch ? descMatch[1].trim() : undefined;

    const id = insertFlowchartData(name, description, parsed);

    console.log(`  Title: ${parsed.title}`);
    console.log(`  Nodes: ${parsed.nodes.length}`);
    console.log(`  Edges: ${parsed.edges.length}`);
    console.log(`  Stages: ${parsed.stages.length}`);
    console.log(`  Chart size: ${parsed.width}×${parsed.height}`);
    console.log(`  ID: ${id}`);

    // Re-link notes
    relinkNotes(id, parsed.nodes);

    results.push({ file: filename, id, name, nodes: parsed.nodes.length, edges: parsed.edges.length });
    console.log();
  }

  console.log('=== Migration Summary ===');
  console.log(`Migrated ${results.length} flowchart(s):\n`);
  for (const r of results) {
    console.log(`  ${r.name} (${r.file})`);
    console.log(`    ID: ${r.id} | ${r.nodes} nodes, ${r.edges} edges`);
  }

  // Verify
  const totalFlowcharts = (db.prepare('SELECT COUNT(*) as count FROM flowcharts').get() as { count: number }).count;
  const totalNodes = (db.prepare('SELECT COUNT(*) as count FROM flowchart_nodes').get() as { count: number }).count;
  console.log(`\nDatabase now contains ${totalFlowcharts} flowchart(s) and ${totalNodes} node(s).`);
  console.log('\nMigration complete!');
}

main();

---
name: interactive-flowchart
description: Create interactive dependency flowcharts as FlowchartSpec JSON for the Scribe app. Use this skill whenever the user asks for a flowchart, roadmap, study plan, prerequisite map, dependency graph, learning path, or any diagram where items have directional prerequisites. Also trigger when the user says "map out", "show me the dependencies", "what leads to what", or asks for a visual plan of any multi-step process. The output is a FlowchartSpec JSON object that Scribe renders as an interactive chart with clickable nodes that highlight prerequisite chains.
---

# Interactive Flowchart Skill

Create polished, interactive dependency flowcharts as **FlowchartSpec JSON**. The JSON is rendered by Scribe's FlowchartRenderer component, which handles all interactivity (clicking any node highlights its full prerequisite chain and dims everything else), arrow drawing, KaTeX math rendering, and theming.

**Your job is to produce the data — nodes, edges, positions, colors, and arrow routing. The renderer handles everything else.**

> Scribe also has a built-in **visual editor** (the "Edit" button on any flowchart, or "New Flowchart" → a template). It reads and writes this exact `FlowchartSpec` schema, so your JSON round-trips losslessly: the user can paste it via the editor's **JSON** drawer or the "Import JSON" button, then refine layout, stages, and colours by hand. Arrow routing is also recomputed automatically in the editor, so rough control points are fine — but still aim for clean routing in your output.

## When to Use

- Study roadmaps and learning paths
- Project dependency graphs
- Course prerequisite maps
- Technology stack progressions
- Any DAG (directed acyclic graph) the user wants to visualize

## Design Principles

1. **Light, printable theme** — cream/off-white background (`#faf8f4`), soft pastel node colors
2. **Gradient color coding** — one color per stage/tier, progressing smoothly (e.g. warm→cool) so depth is visually obvious
3. **No legends needed** — the color mapping should be self-evident from stage labels
4. **Clean typography** — specify `EB Garamond` for body and `IBM Plex Mono` for badges in the fonts field
5. **KaTeX math** — use `$...$` for inline math in any text field (title, refs, topics). The renderer processes this automatically.

## Output Format

Output a single JSON object conforming to the `FlowchartSpec` schema below. Do not output HTML, CSS, or JavaScript — only JSON.

### FlowchartSpec Schema

```typescript
interface FlowchartSpec {
  version: 1;
  title: string;
  subtitle?: string;          // e.g. "Click any node to trace its prerequisite chain"
  width: number;              // canvas width in px (1400–1600 typical)
  height: number;             // canvas height in px (set generously)
  stages: FlowchartStage[];
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  fonts?: {
    body: string;             // "EB Garamond"
    mono: string;             // "IBM Plex Mono"
  };
  background?: string;        // default: "#faf8f4"
}

interface FlowchartStage {
  key: string;                // e.g. "stage-0", "stage-1"
  label: string;              // e.g. "Mathematical Foundations"
  labelPosition: { x: number; y: number };
  colors: {
    background: string;       // node background, e.g. "#faf0e8"
    border: string;           // node border, e.g. "#d4b098"
    title: string;            // title text color
    divider: string;          // divider line color (usually same as border)
    refs: string;             // references text color
    topics: string;           // topics text color
    labelText: string;        // stage label text color
  };
}

interface FlowchartNode {
  id: string;                 // short, semantic, stable (e.g. "linalg", "qsvt")
  stageKey: string;           // references a stage's key
  title: string;              // display title
  badge?: {
    text: string;             // e.g. "CORE", "FRONTIER", "OPTIONAL"
    style: string;            // "core" | "opt" | "frontier"
    background?: string;      // custom badge background color
    color?: string;           // custom badge text color
  };
  refs?: string;              // references — use Markdown: *italic* for book titles
  topics?: string;            // key topics, rendered italicized
  feeds?: string;             // optional "feeds into" summary for leaf nodes
  x: number;                  // absolute left position (px)
  y: number;                  // absolute top position (px)
  width: number;              // node width (px), 215–310 typical
}

interface FlowchartEdge {
  from: string;               // source node id
  to: string;                 // target node id
  fromAnchor: string;         // anchor point on source node
  toAnchor: string;           // anchor point on target node
  controlPoints: {
    c1: [number, number];     // [dx, dy] offset from source anchor
    c2: [number, number];     // [dx, dy] offset from target anchor
  };
  style: "primary" | "secondary";
}
```

### Anchor Points

Named positions on node edges where arrows attach:

- **Cardinal:** `"top"`, `"bottom"`, `"left"`, `"right"` — edge midpoints
- **Fractional bottom:** `"b20"`, `"b30"`, `"b40"`, `"b50"`, `"b60"`, `"b70"`, `"b80"` — bottom edge at that percentage of width
- **Fractional top:** `"t20"`, `"t30"`, `"t40"`, `"t50"`, `"t60"`, `"t70"`, `"t80"` — top edge at that percentage of width

Using fractional anchors allows multiple arrows to leave/arrive at different points on the same edge, **preventing overlap**.

### Edge Styles

- **`"primary"`** — solid line, normal weight, standard arrowhead. Use for direct, essential dependencies.
- **`"secondary"`** — dashed line, thinner, dimmed arrowhead. Use for weaker, long-range, or optional dependencies.

### Control Points

Each edge has two Bézier control point offsets: `c1` (offset from source anchor) and `c2` (offset from target anchor). These shape the curve of the arrow.

Guidelines:
- For **downward arrows** (typical: bottom of source → top of target), use positive `c1[1]` (push down from source) and negative `c2[1]` (pull up toward target). Example: `c1: [0, 80], c2: [0, -60]`.
- For **lateral arrows** (left/right anchors), use horizontal offsets. Example: `c1: [60, 0], c2: [-60, 0]`.
- When **multiple arrows leave the same node**, use different anchor points AND offset control points in **opposite horizontal directions** so they diverge.
- For **long-distance arrows** (skipping stages), use **larger offsets** (80–150px) to create wide arcs through open space, avoiding crossing through intermediate nodes.
- For **adjacent arrows** going to nearby targets, use smaller offsets (30–60px) for tighter curves.

## Layout Rules

**CRITICAL — avoid overlaps:**

1. Leave **≥200px vertical gap** between each stage row of nodes
2. Place stage labels **≥35px above** the top of their node row
3. Nodes in the same row need **≥40px horizontal gap**
4. For stages with two rows of nodes (e.g., 8 items), leave **≥200px** between sub-rows
5. Set canvas `height` generously — better to have whitespace than overlaps
6. When in doubt about spacing, add more — the user can always tighten in-app

**Node sizing:**
- Width: 215–310px depending on content length
- The canvas width should accommodate 4–5 nodes per row comfortably (1400–1600px typical)

**Stage color progression:**
- Progress from warm to cool across stages (e.g. sand → rose → lavender → blue → teal)
- Each stage needs a full color set: background, border, title, divider, refs, topics, labelText
- Keep backgrounds light and pastel; text colors should be darker versions of the same hue

## Node IDs

Node IDs are the stable keys used for cross-app linking (e.g., Pyramid references a Scribe node by its ID). They must be:

- **Short and semantic** — `"linalg"`, `"qsvt"`, `"hamsim"` — not UUIDs or auto-generated strings
- **Unique within the flowchart**
- **Stable** — don't rename them once established, as other apps may reference them
- **Lowercase, no spaces** — use hyphens if needed: `"ham-sim"`, `"q-walk"`

## Text Formatting

- **Refs:** Use Markdown italic for book/paper titles: `*Linear Algebra Done Right*` (not `<em>`)
- **Math:** Use `$...$` for inline LaTeX: `$\\mathsf{BQP}$`, `$\\Omega(\\sqrt{N})$`
- **Topics:** Plain text, comma-separated. Rendered in italics automatically by the renderer.
- **No HTML tags.** All formatting is Markdown or LaTeX.

## Build Process

1. **Gather requirements**: understand the stages, nodes, and dependencies from the user
2. **Plan layout**: assign each node an (x, y) position, ensuring spacing rules are met
3. **Define stages**: assign color palettes progressing warm→cool, position stage labels
4. **Define nodes**: for each node, set id, title, refs, topics, badge, position, width
5. **Define edges**: for each dependency, choose anchor points and control point offsets that produce clean, non-crossing curves
6. **Review arrow routing**: mentally trace each edge — will it cross through a node? If so, use wider arcs or different anchors.
7. **Output the JSON**: a single `FlowchartSpec` object

## Common Pitfalls

- **Overlapping nodes/labels**: Most common issue. Always leave generous vertical gaps between stages.
- **Arrows crossing through nodes**: Use wide arcs with large control point offsets to route around intermediate nodes.
- **Bundled arrows**: When multiple arrows leave the same node, use different anchor points AND different control point directions.
- **Identical anchor points**: If two edges share the same fromAnchor on the same node, their arrows will overlap. Spread them out (e.g., `b30` and `b70` instead of both using `bottom`).
- **Missing node IDs in edges**: Every `from` and `to` in an edge must match an existing node `id`. The renderer validates this.
- **Forgetting secondary style for weak dependencies**: Long-range or optional dependencies should use `"secondary"` style so they visually recede.

## Complete Example

Below is a small but complete FlowchartSpec demonstrating all features:

```json
{
  "version": 1,
  "title": "Real Analysis Foundations",
  "subtitle": "Click any node to trace its prerequisite chain",
  "width": 1500,
  "height": 1100,
  "background": "#faf8f4",
  "fonts": {
    "body": "EB Garamond",
    "mono": "IBM Plex Mono"
  },
  "stages": [
    {
      "key": "stage-0",
      "label": "Foundations",
      "labelPosition": { "x": 50, "y": 55 },
      "colors": {
        "background": "#faf0e8",
        "border": "#d4b098",
        "title": "#8a5030",
        "divider": "#d4b098",
        "refs": "#7a5a40",
        "topics": "#8a6a50",
        "labelText": "#8a5030"
      }
    },
    {
      "key": "stage-1",
      "label": "Core Analysis",
      "labelPosition": { "x": 50, "y": 335 },
      "colors": {
        "background": "#f0ecf6",
        "border": "#b0a0c8",
        "title": "#4a3070",
        "divider": "#b0a0c8",
        "refs": "#5a4a7a",
        "topics": "#6a5a8a",
        "labelText": "#4a3070"
      }
    },
    {
      "key": "stage-2",
      "label": "Advanced Topics",
      "labelPosition": { "x": 50, "y": 615 },
      "colors": {
        "background": "#eaeff6",
        "border": "#90a8c8",
        "title": "#2a4a70",
        "divider": "#90a8c8",
        "refs": "#3a5a7a",
        "topics": "#4a6a8a",
        "labelText": "#2a4a70"
      }
    }
  ],
  "nodes": [
    {
      "id": "sets-logic",
      "stageKey": "stage-0",
      "title": "Set Theory & Logic",
      "refs": "*Halmos, Naive Set Theory*; Enderton, *Elements of Set Theory*",
      "topics": "Cardinality, axiom of choice, Zorn's lemma, ordinals",
      "x": 50,
      "y": 90,
      "width": 280
    },
    {
      "id": "topology",
      "stageKey": "stage-0",
      "title": "Point-Set Topology",
      "badge": { "text": "CORE", "style": "core" },
      "refs": "*Munkres, Topology*; Willard, *General Topology*",
      "topics": "Compactness, connectedness, metric spaces, nets, product topology",
      "x": 380,
      "y": 90,
      "width": 290
    },
    {
      "id": "sequences",
      "stageKey": "stage-0",
      "title": "Sequences & Series",
      "refs": "*Rudin, Principles of Mathematical Analysis* ch. 3–4",
      "topics": "Convergence, Cauchy sequences, $\\limsup$/$\\liminf$, absolute convergence",
      "x": 720,
      "y": 90,
      "width": 285
    },
    {
      "id": "measure",
      "stageKey": "stage-1",
      "title": "Measure Theory",
      "badge": { "text": "CORE", "style": "core" },
      "refs": "*Folland, Real Analysis* ch. 1–2; *Rudin, Real & Complex Analysis*",
      "topics": "$\\sigma$-algebras, Lebesgue measure, measurable functions, convergence theorems (DCT, MCT, Fatou)",
      "x": 50,
      "y": 370,
      "width": 300
    },
    {
      "id": "integration",
      "stageKey": "stage-1",
      "title": "Integration",
      "refs": "*Folland* ch. 2–3; *Stein & Shakarchi, Real Analysis*",
      "topics": "Lebesgue integral, $L^p$ spaces, Fubini–Tonelli, Radon–Nikodym, signed measures",
      "x": 400,
      "y": 370,
      "width": 290
    },
    {
      "id": "differentiation",
      "stageKey": "stage-1",
      "title": "Differentiation",
      "refs": "*Folland* ch. 3; *Stein & Shakarchi* ch. 3",
      "topics": "Lebesgue differentiation theorem, Hardy–Littlewood maximal function, functions of bounded variation",
      "x": 740,
      "y": 370,
      "width": 280
    },
    {
      "id": "functional",
      "stageKey": "stage-2",
      "title": "Functional Analysis",
      "badge": { "text": "FRONTIER", "style": "frontier" },
      "refs": "*Brezis, Functional Analysis*; *Conway, A Course in Functional Analysis*",
      "topics": "Banach spaces, Hahn–Banach, open mapping, closed graph, weak topologies, spectral theory",
      "x": 50,
      "y": 650,
      "width": 310
    },
    {
      "id": "probability",
      "stageKey": "stage-2",
      "title": "Probability Theory",
      "refs": "*Durrett, Probability*; *Williams, Probability with Martingales*",
      "topics": "Probability spaces, conditional expectation, martingales, CLT, large deviations",
      "x": 410,
      "y": 650,
      "width": 290
    }
  ],
  "edges": [
    {
      "from": "sets-logic",
      "to": "topology",
      "fromAnchor": "b70",
      "toAnchor": "t30",
      "controlPoints": { "c1": [30, 50], "c2": [-30, -50] },
      "style": "primary"
    },
    {
      "from": "sets-logic",
      "to": "measure",
      "fromAnchor": "b40",
      "toAnchor": "t20",
      "controlPoints": { "c1": [-10, 80], "c2": [-10, -60] },
      "style": "primary"
    },
    {
      "from": "topology",
      "to": "measure",
      "fromAnchor": "b30",
      "toAnchor": "t50",
      "controlPoints": { "c1": [-40, 60], "c2": [20, -60] },
      "style": "primary"
    },
    {
      "from": "topology",
      "to": "integration",
      "fromAnchor": "b60",
      "toAnchor": "t30",
      "controlPoints": { "c1": [20, 60], "c2": [-20, -60] },
      "style": "primary"
    },
    {
      "from": "sequences",
      "to": "measure",
      "fromAnchor": "b30",
      "toAnchor": "t80",
      "controlPoints": { "c1": [-60, 80], "c2": [40, -60] },
      "style": "secondary"
    },
    {
      "from": "sequences",
      "to": "differentiation",
      "fromAnchor": "b60",
      "toAnchor": "t50",
      "controlPoints": { "c1": [20, 60], "c2": [0, -60] },
      "style": "primary"
    },
    {
      "from": "measure",
      "to": "integration",
      "fromAnchor": "right",
      "toAnchor": "left",
      "controlPoints": { "c1": [50, 0], "c2": [-50, 0] },
      "style": "primary"
    },
    {
      "from": "integration",
      "to": "differentiation",
      "fromAnchor": "right",
      "toAnchor": "left",
      "controlPoints": { "c1": [50, 0], "c2": [-50, 0] },
      "style": "primary"
    },
    {
      "from": "measure",
      "to": "functional",
      "fromAnchor": "b40",
      "toAnchor": "t30",
      "controlPoints": { "c1": [-10, 60], "c2": [-10, -60] },
      "style": "primary"
    },
    {
      "from": "integration",
      "to": "functional",
      "fromAnchor": "b30",
      "toAnchor": "t60",
      "controlPoints": { "c1": [-30, 60], "c2": [20, -60] },
      "style": "primary"
    },
    {
      "from": "integration",
      "to": "probability",
      "fromAnchor": "b60",
      "toAnchor": "t40",
      "controlPoints": { "c1": [20, 60], "c2": [-10, -60] },
      "style": "primary"
    },
    {
      "from": "measure",
      "to": "probability",
      "fromAnchor": "b70",
      "toAnchor": "t20",
      "controlPoints": { "c1": [60, 80], "c2": [-40, -60] },
      "style": "primary"
    },
    {
      "from": "topology",
      "to": "functional",
      "fromAnchor": "b80",
      "toAnchor": "t80",
      "controlPoints": { "c1": [40, 200], "c2": [60, -60] },
      "style": "secondary"
    }
  ]
}
```

### Badge Style Reference

Built-in badge styles (the renderer maps these to colors):

| style | Typical use | Background | Text |
|-------|------------|------------|------|
| `"core"` | Essential/required nodes | `#e8d8c8` | `#6a4a30` |
| `"opt"` | Optional/supplementary | `#d8e8d8` | `#3a6a3a` |
| `"frontier"` | Advanced/research-level | `#d8dce8` | `#3a4a6a` |

For custom badges, provide `background` and `color` overrides in the badge object.

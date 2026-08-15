import type { FlowchartSpec, FlowchartStage, FlowchartNode, FlowchartEdge } from '../types/flowchart';
import { generateStagePalette } from '../components/FlowchartRenderer/colorUtils';
import { routeEdges } from './edgeRouting';
import { STAGE_ACCENTS } from '../palette';

// Starter specs for the "New Flowchart" flow so a chart can be created entirely
// in-app, without hand-authoring JSON. All produce valid FlowchartSpec objects.

const BASE: Pick<FlowchartSpec, 'version' | 'subtitle' | 'background' | 'fonts'> = {
  version: 1,
  subtitle: 'Click any node to trace its prerequisite chain',
  background: '#faf8f4',
  fonts: { body: 'EB Garamond', mono: 'IBM Plex Mono' },
};

function makeStage(key: string, label: string, labelY: number, accent: string): FlowchartStage {
  return {
    key,
    label,
    labelPosition: { x: 50, y: labelY },
    colors: generateStagePalette(accent),
  };
}

function makeEdge(from: string, to: string, style: FlowchartEdge['style'] = 'primary'): FlowchartEdge {
  // Anchors/control points are placeholders; routeEdges() finalizes them below.
  return { from, to, fromAnchor: 'bottom', toAnchor: 'top', controlPoints: { c1: [0, 50], c2: [0, -50] }, style };
}

/** A minimal chart: one empty stage, ready for the user to add nodes + stages. */
export function blankSpec(title: string): FlowchartSpec {
  return {
    ...BASE,
    title: title || 'Untitled Flowchart',
    width: 1500,
    height: 1000,
    stages: [makeStage('stage-0', 'Stage 1', 55, STAGE_ACCENTS[0])],
    nodes: [],
    edges: [],
  };
}

/** A three-tier roadmap with sample nodes/edges demonstrating structure. */
export function roadmapSpec(title: string): FlowchartSpec {
  const stages: FlowchartStage[] = [
    makeStage('stage-0', 'Foundations', 55, STAGE_ACCENTS[0]),
    makeStage('stage-1', 'Core', 335, STAGE_ACCENTS[2]),
    makeStage('stage-2', 'Advanced', 615, STAGE_ACCENTS[3]),
  ];

  const nodes: FlowchartNode[] = [
    { id: 'first', stageKey: 'stage-0', title: 'First Topic', x: 50, y: 90, width: 280 },
    { id: 'second', stageKey: 'stage-0', title: 'Second Topic', x: 380, y: 90, width: 280 },
    { id: 'core', stageKey: 'stage-1', title: 'Core Concept', x: 50, y: 370, width: 300 },
    { id: 'applied', stageKey: 'stage-1', title: 'Applied Method', x: 400, y: 370, width: 280 },
    { id: 'advanced', stageKey: 'stage-2', title: 'Advanced Topic', x: 50, y: 650, width: 300 },
  ];

  const edges = routeEdges(nodes, [
    makeEdge('first', 'core'),
    makeEdge('second', 'core'),
    makeEdge('second', 'applied'),
    makeEdge('core', 'advanced'),
    makeEdge('applied', 'advanced'),
  ]);

  return {
    ...BASE,
    title: title || 'New Roadmap',
    width: 1500,
    height: 1000,
    stages,
    nodes,
    edges,
  };
}

export interface FlowchartTemplate {
  id: string;
  name: string;
  description: string;
  build: (title: string) => FlowchartSpec;
}

export const FLOWCHART_TEMPLATES: FlowchartTemplate[] = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'One empty stage — add your own nodes and stages.',
    build: blankSpec,
  },
  {
    id: 'roadmap',
    name: 'Three-stage roadmap',
    description: 'Foundations → Core → Advanced with sample nodes and arrows.',
    build: roadmapSpec,
  },
];

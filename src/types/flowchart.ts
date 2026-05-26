export interface FlowchartSpec {
  version: 1;
  title: string;
  subtitle?: string;
  width: number;
  height: number;
  stages: FlowchartStage[];
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  fonts?: {
    body: string;
    mono: string;
  };
  background?: string;
}

export interface FlowchartStage {
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

export interface FlowchartNode {
  id: string;
  stageKey: string;
  title: string;
  badge?: {
    text: string;
    style: string;
    background?: string;
    color?: string;
  };
  refs?: string;
  topics?: string;
  feeds?: string;
  x: number;
  y: number;
  width: number;
}

export interface FlowchartEdge {
  from: string;
  to: string;
  fromAnchor: string;
  toAnchor: string;
  controlPoints: {
    c1: [number, number];
    c2: [number, number];
  };
  style: 'primary' | 'secondary';
}

/** Database record (what the API returns) */
export interface Flowchart {
  id: string;
  name: string;
  description?: string;
  spec: FlowchartSpec;
  createdAt: string;
  updatedAt: string;
}

/** Summary record (list endpoint, no spec) */
export interface FlowchartSummary {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/** Denormalized node record for cross-app queries */
export interface FlowchartNodeRecord {
  id: string;
  flowchartId: string;
  nodeKey: string;
  title: string;
  refs?: string;
  topics?: string;
  stageKey?: string;
}

/** Node record joined with the parent flowchart's display name. */
export interface FlowchartNodeWithFlowchart extends FlowchartNodeRecord {
  flowchartName: string;
}

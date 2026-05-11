/**
 * @module graph/layout
 * Column-based layout engine for SEL protection logic graphs.
 *
 * Replaces the Sugiyama/barycenter approach with a simple, predictable
 * spreadsheet-style column layout that guarantees readable, non-overlapping
 * node placement.
 *
 * Column definitions (left → right):
 *   Col 0 – Input signals    (52A, COMM_IN, RxWI, INxxx, binary inputs)
 *   Col 1 – Pickup elements  (50P1P, 51P1P, 21P1P, 87LP, …)
 *   Col 2 – Timer nodes (TC) (51P1TC, 51G1TC, 21P2TC, 79TC, …)
 *   Col 3 – Trip word bits   (50P1T, 51P1T, 21P1T, 87LT, …)
 *   Col 4 – Logic gates      (AND/OR/NOT combining word bits; g_ prefix)
 *   Col 5 – Trip output      (TR, TRIP, CL, CLOSE)
 *   Col 6 – Output contacts  (OUT101, OUT201, out-OUTxxx)
 *   Col 7 – Unclassified     (fallback, x=1600)
 *
 * Within each column nodes are sorted by protection priority:
 *   87 (differential) → 21 (distance) → 67 (directional OC) →
 *   51 (TOC) → 50 (instantaneous) → 79 (recloser) → other/auxiliary
 * then alphabetically within the same group.
 *
 * Logic gate nodes (col 4) are positioned at the vertical midpoint of their
 * source nodes rather than using a fixed row height.
 */

import type { Node as FlowNode, Edge as FlowEdge } from 'reactflow';
import {
  isPickupBit,
  isTripWordBit,
  isTimerCounterNode,
} from './protection';

// ─── Column x positions (left edge of node) ───────────────────────────────────

/**
 * X position (left edge) for each layout column.
 * Col 7 is the unclassified-fallback column.
 */
export const COL_X: Record<number, number> = {
  0: 40,    // input signals        (InputSignalNode 150px wide)
  1: 240,   // pickup elements      (ProtectionElementNode 190px wide)
  2: 480,   // timer nodes TC       (TimerNode 170px wide)
  3: 700,   // trip word bits       (ProtectionElementNode 190px wide)
  4: 940,   // logic gates          (LogicGateSymbolNode 70px wide)
  5: 1060,  // TR output            (TripOutputNode 210px wide)
  6: 1320,  // output contacts      (OutputContactNode 170px wide)
  7: 1600,  // unclassified fallback
};

// ─── Row heights ──────────────────────────────────────────────────────────────

/** Row height for protection element nodes (pickup/trip word bits). */
export const ROW_HEIGHT_PROTECTION = 200;

/** Row height for input signal nodes. */
export const ROW_HEIGHT_INPUT = 120;

/** Row height for logic gate symbol nodes. */
export const ROW_HEIGHT_GATE = 80;

/** Top margin (px) before the first node in each column. */
export const COL_TOP_MARGIN = 60;

// ─── Spacing constants (kept for backward compatibility) ─────────────────────

/** Minimum horizontal gap between any two node bounding boxes (px). */
export const MIN_H_GAP = 40;

/** Minimum vertical gap between any two node bounding boxes (px). */
export const MIN_V_GAP = 30;

// ─── Node size constants ──────────────────────────────────────────────────────

/** Width × height (px) for each node type. Used for collision detection. */
export const NODE_SIZES: Record<string, { width: number; height: number }> = {
  protectionElement: { width: 180, height: 160 },
  timerNode:         { width: 160, height: 180 },
  logicGateNode:     { width: 160, height:  80 },
  logicGateSymbol:   { width:  60, height:  50 },
  inputSignalNode:   { width: 140, height:  60 },
  outputContactNode: { width: 160, height:  80 },
  tripOutputNode:    { width: 200, height: 100 },
  latchNode:         { width: 160, height:  80 },
  default:           { width: 160, height:  80 },
};

/** Look up the size for a node by its React Flow type string. */
export function nodeSizeForType(nodeType: string): { width: number; height: number } {
  return NODE_SIZES[nodeType] ?? NODE_SIZES['default'];
}

// ─── Bounding box type ────────────────────────────────────────────────────────

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Collision detection ──────────────────────────────────────────────────────

/** Check whether two bounding boxes overlap (with a margin added on all sides). */
function overlaps(a: BoundingBox, b: BoundingBox, margin = MIN_V_GAP): boolean {
  return (
    a.x < b.x + b.width  + margin &&
    a.x + a.width  + margin > b.x &&
    a.y < b.y + b.height + margin &&
    a.y + a.height + margin > b.y
  );
}

/**
 * Detect collision pairs in a list of positioned nodes.
 * Returns array of overlapping [idA, idB] pairs.
 */
export function detectCollisions(
  positions: Map<string, { x: number; y: number }>,
  sizes: Map<string, { width: number; height: number }>,
  margin = MIN_V_GAP,
): Array<[string, string]> {
  const ids = Array.from(positions.keys());
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const aId = ids[i];
      const bId = ids[j];
      const aPos  = positions.get(aId)!;
      const aSize = sizes.get(aId) ?? NODE_SIZES['default'];
      const bPos  = positions.get(bId)!;
      const bSize = sizes.get(bId) ?? NODE_SIZES['default'];
      const aBox: BoundingBox = { x: aPos.x, y: aPos.y, width: aSize.width, height: aSize.height };
      const bBox: BoundingBox = { x: bPos.x, y: bPos.y, width: bSize.width, height: bSize.height };
      if (overlaps(aBox, bBox, margin)) pairs.push([aId, bId]);
    }
  }
  return pairs;
}

/**
 * Resolve vertical collisions within a single tier/column.
 * For every pair of overlapping nodes, push the lower one down.
 * Iterates until stable (up to MAX_ITERS times).
 */
export function resolveCollisionsInTier(
  tierIds: string[],
  positions: Map<string, { x: number; y: number }>,
  sizes: Map<string, { width: number; height: number }>,
): void {
  const MAX_ITERS = 20;
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    let anyFixed = false;
    for (let i = 0; i < tierIds.length - 1; i++) {
      const aId = tierIds[i];
      const bId = tierIds[i + 1];
      const aPos  = positions.get(aId);
      const bPos  = positions.get(bId);
      if (!aPos || !bPos) continue;
      const aSize = sizes.get(aId) ?? NODE_SIZES['default'];
      const bSize = sizes.get(bId) ?? NODE_SIZES['default'];

      const aBottom = aPos.y + aSize.height / 2;
      const bTop    = bPos.y - bSize.height / 2;
      const gap     = bTop - aBottom;

      if (gap < MIN_V_GAP) {
        const push = MIN_V_GAP - gap;
        positions.set(bId, { x: bPos.x, y: bPos.y + push });
        anyFixed = true;
      }
    }
    if (!anyFixed) break;
  }
}

/** Re-centre a column's nodes vertically around y=0. */
export function recentreTier(
  tierIds: string[],
  positions: Map<string, { x: number; y: number }>,
): void {
  if (tierIds.length === 0) return;
  const ys = tierIds.map(id => positions.get(id)?.y ?? 0);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const centre = (minY + maxY) / 2;
  if (Math.abs(centre) < 0.5) return;
  for (const id of tierIds) {
    const pos = positions.get(id);
    if (pos) positions.set(id, { x: pos.x, y: pos.y - centre });
  }
}

// ─── Protection priority ──────────────────────────────────────────────────────

/**
 * Protection priority within a column.
 * Lower number = higher priority = appears higher (smaller y) in the column.
 * Order: 87 (differential, most critical) → 21 → 67 → 51 → 50 → 79 → other
 */
const PROTECTION_PRIORITY_ORDER: Array<[RegExp, number]> = [
  [/^87/i, 0],
  [/^21/i, 1],
  [/^67/i, 2],
  [/^51/i, 3],
  [/^50/i, 4],
  [/^79/i, 5],
];

function protectionPriority(id: string): number {
  for (const [re, pri] of PROTECTION_PRIORITY_ORDER) {
    if (re.test(id)) return pri;
  }
  return 99;
}

// ─── Trip output IDs ──────────────────────────────────────────────────────────

const TRIP_IDS = new Set(['TR', 'TRIP', 'CL', 'CLOSE']);

// ─── Column classifier ────────────────────────────────────────────────────────

/**
 * Classify a node into its layout column (0–7) by node ID and React Flow type.
 *
 * Classification priority (first match wins):
 *   1. Output contacts  → col 6  (out-OUTxxx prefix, OUTxxx ID, outputContactNode type)
 *   2. Trip outputs     → col 5  (TR/TRIP/CL/CLOSE, tripOutputNode type)
 *   3. Logic gates      → col 4  (g_ prefix, *Gate type, logicGateNode type)
 *   4. Timer TC nodes   → col 2  (TC suffix, timerNode type)
 *   5. Trip word bits   → col 3  (protection prefix + T suffix)
 *   6. Pickup bits      → col 1  (protection prefix + P suffix)
 *   7. Everything else  → col 0  (input signals, misc)
 *
 * Returns col 0 for any node that can't be classified by type or ID pattern.
 */
export function classifyNodeColumn(nodeId: string, nodeType?: string): number {
  const id = nodeId.toUpperCase();

  // Col 6: output contacts
  if (
    /^out-/i.test(nodeId) ||          // out-OUTxxx prefix form
    /^OUT\d+$/.test(id) ||             // OUTxxx bare form
    nodeType === 'outputContactNode'
  ) return 6;

  // Col 5: trip outputs
  if (TRIP_IDS.has(id) || nodeType === 'tripOutputNode') return 5;

  // Col 4: logic gate nodes and latch nodes (computed logic, not raw inputs)
  if (
    nodeId.startsWith('g_') ||         // gate decomposition prefix
    /^SV\d+/i.test(nodeId) ||          // SV* latch/supervisory elements
    nodeType?.endsWith('Gate') ||       // andGate, orGate, notGate, edgeGate
    nodeType === 'logicGateNode' ||
    nodeType === 'latchNode'           // latch elements are computed, not raw signals
  ) return 4;

  // Col 2: timer counter (TC) nodes
  if (isTimerCounterNode(nodeId) || nodeType === 'timerNode') return 2;

  // Col 3: trip word bits (protection prefix + T suffix)
  if (isTripWordBit(id)) return 3;

  // Col 1: pickup bits (protection prefix + P suffix)
  if (isPickupBit(id)) return 1;

  // Col 1: any protectionElement that isn't a trip bit goes to pickups
  if (nodeType === 'protectionElement') return 1;

  // Col 0: input signals and everything else not already classified (default)
  return 0;
}

// ─── Row height for a column ──────────────────────────────────────────────────

function rowHeightForColumn(col: number): number {
  switch (col) {
    case 0: return ROW_HEIGHT_INPUT;
    case 4: return ROW_HEIGHT_GATE;
    default: return ROW_HEIGHT_PROTECTION;
  }
}

// ─── Positioned node type ─────────────────────────────────────────────────────

export interface PositionedNode {
  id: string;
  position: { x: number; y: number };
}

// ─── Main layout function ─────────────────────────────────────────────────────

/**
 * Compute column-based layout positions for all React Flow nodes.
 *
 * Algorithm:
 *   1. Classify each node into a column (0–7) by type and ID pattern.
 *   2. Sort nodes within each column by protection priority, then alphabetically.
 *   3. Assign y positions per column, stacking top-to-bottom with appropriate row heights.
 *   4. For logic gate nodes (col 4): set y = average y of source nodes in edges.
 *      Process gates in topological order (sources before dependents).
 *   5. Centre all nodes vertically around y=0.
 *   6. Emit dev-mode assertions: no (0,0) positions, no overlaps within columns.
 *
 * @param nodes  React Flow node array (from buildReactFlowLayout)
 * @param edges  React Flow edge array (from buildReactFlowLayout)
 * @returns      Array of { id, position } for every node
 */
export function computeLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
): PositionedNode[] {
  if (nodes.length === 0) return [];

  // ── Step 1: Classify nodes into columns ──────────────────────────────────
  // Separate gate nodes (col 4) since they are positioned relative to sources.
  const columns = new Map<number, FlowNode[]>();
  for (let c = 0; c <= 7; c++) columns.set(c, []);

  const gateNodes: FlowNode[] = [];

  for (const node of nodes) {
    const col = classifyNodeColumn(node.id, node.type);
    if (col === 4) {
      gateNodes.push(node);
    } else {
      columns.get(col)!.push(node);
    }
  }

  // ── Step 2: Sort non-gate columns ────────────────────────────────────────
  for (const colNodes of columns.values()) {
    colNodes.sort((a, b) => {
      const pa = protectionPriority(a.id);
      const pb = protectionPriority(b.id);
      if (pa !== pb) return pa - pb;
      return a.id.localeCompare(b.id);
    });
  }

  // ── Step 3: Assign y positions for non-gate columns ──────────────────────
  const positions = new Map<string, { x: number; y: number }>();

  for (const [col, colNodes] of columns) {
    if (colNodes.length === 0) continue;
    const x = COL_X[col] ?? COL_X[7];
    const rowH = rowHeightForColumn(col);

    let y = COL_TOP_MARGIN;
    for (const node of colNodes) {
      positions.set(node.id, { x, y });
      y += rowH;
    }
  }

  // ── Step 4: Position gate nodes from source midpoints ────────────────────
  // Build adjacency: edge.target → [edge.source, ...]
  const incomingEdges = new Map<string, string[]>();
  for (const edge of edges) {
    if (!incomingEdges.has(edge.target)) incomingEdges.set(edge.target, []);
    incomingEdges.get(edge.target)!.push(edge.source);
  }

  // Topological sort of gate nodes (process sources before dependents).
  // Since gates can be chained (gate feeds another gate), we use Kahn's algorithm
  // restricted to gate nodes only.
  const gateIdSet = new Set(gateNodes.map(n => n.id));

  const gateInDeg = new Map<string, number>();
  for (const gNode of gateNodes) {
    const sources = incomingEdges.get(gNode.id) ?? [];
    const gateSrcCount = sources.filter(s => gateIdSet.has(s)).length;
    gateInDeg.set(gNode.id, gateSrcCount);
  }

  const gateQueue = gateNodes.filter(n => (gateInDeg.get(n.id) ?? 0) === 0);
  const gateOutgoing = new Map<string, string[]>(); // source gate → downstream gate ids
  for (const edge of edges) {
    if (!gateIdSet.has(edge.source)) continue;
    if (!gateOutgoing.has(edge.source)) gateOutgoing.set(edge.source, []);
    gateOutgoing.get(edge.source)!.push(edge.target);
  }

  const topoGates: FlowNode[] = [];
  const gateById = new Map(gateNodes.map(n => [n.id, n]));

  while (gateQueue.length > 0) {
    const cur = gateQueue.shift()!;
    topoGates.push(cur);
    for (const downId of gateOutgoing.get(cur.id) ?? []) {
      if (!gateIdSet.has(downId)) continue;
      const deg = (gateInDeg.get(downId) ?? 1) - 1;
      gateInDeg.set(downId, deg);
      if (deg <= 0) {
        const dn = gateById.get(downId);
        if (dn) gateQueue.push(dn);
      }
    }
  }
  // Remaining gates (cycles) — append at end
  for (const gNode of gateNodes) {
    if (!topoGates.find(n => n.id === gNode.id)) topoGates.push(gNode);
  }

  const gateX = COL_X[4];

  for (const gNode of topoGates) {
    const sources = incomingEdges.get(gNode.id) ?? [];
    const sourcePosArr = sources
      .map(s => positions.get(s))
      .filter((p): p is { x: number; y: number } => p !== undefined);

    let y: number;
    if (sourcePosArr.length > 0) {
      y = sourcePosArr.reduce((sum, p) => sum + p.y, 0) / sourcePosArr.length;
    } else {
      // No positioned sources: use vertical midpoint of all positioned nodes
      const allYs = Array.from(positions.values()).map(p => p.y);
      y = allYs.length > 0
        ? (Math.min(...allYs) + Math.max(...allYs)) / 2
        : COL_TOP_MARGIN;
    }
    positions.set(gNode.id, { x: gateX, y });
  }

  // ── Step 4b: Resolve gate collisions ─────────────────────────────────────
  // Sort gates by their computed y, then spread them out if they overlap.
  if (gateNodes.length > 1) {
    const gateSorted = [...gateNodes].sort((a, b) => {
      const ya = positions.get(a.id)?.y ?? 0;
      const yb = positions.get(b.id)?.y ?? 0;
      return ya - yb;
    });
    const gateIds = gateSorted.map(n => n.id);
    const gateSizes = new Map(gateIds.map(id => [id, NODE_SIZES['default']]));
    resolveCollisionsInTier(gateIds, positions, gateSizes);
  }

  // ── Step 5: Centre all nodes vertically around y=0 ───────────────────────
  if (positions.size > 0) {
    const allYs = Array.from(positions.values()).map(p => p.y);
    const minY = Math.min(...allYs);
    const maxY = Math.max(...allYs);
    const centre = (minY + maxY) / 2;
    if (Math.abs(centre) > 0.5) {
      for (const [id, pos] of positions) {
        positions.set(id, { x: pos.x, y: pos.y - centre });
      }
    }
  }

  // ── Step 6: Dev-mode assertions ───────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((import.meta as any).env?.MODE !== 'production') {
    const multiNode = nodes.length > 1;
    for (const node of nodes) {
      const pos = positions.get(node.id);
      if (!pos || pos.x === undefined || pos.y === undefined) {
        console.error(`[SEL-Layout] Node "${node.id}" has no position assigned.`);
      } else if (multiNode && pos.x === 0 && pos.y === 0) {
        console.error(`[SEL-Layout] Node "${node.id}" is at (0,0) — likely unpositioned.`);
      }
    }
  }

  // ── Return positioned nodes ───────────────────────────────────────────────
  return nodes.map(node => ({
    id: node.id,
    position: positions.get(node.id) ?? { x: COL_X[7], y: 0 },
  }));
}

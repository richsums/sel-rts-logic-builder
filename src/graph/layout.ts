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
    id === 'ALRMOUT' ||                // SEL-351S alarm contact
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
 * Compute connection-aware layout positions for all React Flow nodes.
 *
 * Algorithm:
 *   Step 1 — Anchor the rightmost tier first:
 *            TR (col 5) at y = 0; output contacts (col 6) at y = 0.
 *   Step 2 — Work backward left (cols 3 → 2 → 1 → 0):
 *            For each node, set y = weighted average y of the nodes it connects
 *            to in the next column. Gate nodes (col 4) are transparent for this
 *            step — their y is resolved transitively to the first non-gate target.
 *   Step 3 — Resolve vertical collisions within each non-gate column:
 *            Sort by computed y, push overlapping nodes down (center-to-center
 *            distance < nodeHeight/2 + nodeHeight/2 + MIN_V_GAP), then
 *            re-centre the column so its midpoint aligns with y = 0.
 *   Step 4 — Position logic gate nodes at the midpoint of their input nodes
 *            (processed in topological order, sources before dependents).
 *            Resolve gate collisions with resolveCollisionsInTier.
 *   Step 5 — Final pass: eliminate any remaining per-column overlaps
 *            (max 10 iterations, 20 px padding).
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

  // ── Classify nodes into columns ──────────────────────────────────────────
  const gateIds = new Set<string>();
  const columns = new Map<number, FlowNode[]>();
  for (let c = 0; c <= 7; c++) columns.set(c, []);

  for (const node of nodes) {
    const col = classifyNodeColumn(node.id, node.type);
    columns.get(col)!.push(node);
    if (col === 4) gateIds.add(node.id);
  }

  // ── Build edge adjacency ─────────────────────────────────────────────────
  const outEdges = new Map<string, string[]>();  // node → [targets]
  const inEdges  = new Map<string, string[]>();  // node → [sources]
  for (const edge of edges) {
    if (!outEdges.has(edge.source)) outEdges.set(edge.source, []);
    outEdges.get(edge.source)!.push(edge.target);
    if (!inEdges.has(edge.target)) inEdges.set(edge.target, []);
    inEdges.get(edge.target)!.push(edge.source);
  }

  const positions = new Map<string, { x: number; y: number }>();

  // Transitively resolve the effective y of a node, following gate chains
  // until a non-gate node with a known position is reached.
  // The visited set prevents infinite recursion in degenerate cycles.
  function resolveY(nodeId: string, visited = new Set<string>()): number | null {
    if (visited.has(nodeId)) return null;
    visited.add(nodeId);
    if (!gateIds.has(nodeId)) {
      // Non-gate: return its own y if already positioned
      return positions.get(nodeId)?.y ?? null;
    }
    // Gate: average the effective y of its targets
    const targets = outEdges.get(nodeId) ?? [];
    const ys: number[] = [];
    for (const t of targets) {
      const y = resolveY(t, new Set(visited));
      if (y !== null) ys.push(y);
    }
    return ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
  }

  // ── Step 1: Anchor col 5 (TR) at y = 0, col 6 (outputs) at y = 0 ────────
  for (const node of (columns.get(5) ?? [])) {
    positions.set(node.id, { x: COL_X[5], y: 0 });
  }
  for (const node of (columns.get(6) ?? [])) {
    positions.set(node.id, { x: COL_X[6], y: 0 });
  }

  // ── Step 2: Barycenter — work backward cols 3 → 2 → 1 → 0 (and 7) ───────
  // Gates (col 4) are not positioned here; resolveY follows through them.
  for (const col of [3, 2, 1, 0, 7]) {
    const colNodes = columns.get(col) ?? [];
    if (colNodes.length === 0) continue;
    const colX = COL_X[col] ?? COL_X[7];

    for (const node of colNodes) {
      const targets = outEdges.get(node.id) ?? [];
      const ys: number[] = [];
      for (const t of targets) {
        const y = resolveY(t);
        if (y !== null) ys.push(y);
      }
      const y = ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
      positions.set(node.id, { x: colX, y });
    }
  }

  // ── Step 3: Resolve collisions & re-centre per non-gate column ───────────
  for (const col of [0, 1, 2, 3, 5, 6, 7]) {
    const colNodes = columns.get(col) ?? [];
    if (colNodes.length <= 1) continue;

    // Sort by computed y (ascending)
    colNodes.sort((a, b) => (positions.get(a.id)?.y ?? 0) - (positions.get(b.id)?.y ?? 0));

    // Push overlapping nodes downward (center-to-center minimum distance).
    // Use at least NODE_SIZES['default'].height so spacing is consistent with
    // the detectCollisions check, which treats all nodes as default-sized.
    const defH = NODE_SIZES['default'].height;
    for (let i = 1; i < colNodes.length; i++) {
      const prev = colNodes[i - 1];
      const curr = colNodes[i];
      const prevPos  = positions.get(prev.id)!;
      const prevSize = nodeSizeForType(prev.type ?? 'default');
      const currPos  = positions.get(curr.id)!;
      const currSize = nodeSizeForType(curr.type ?? 'default');

      const effPrevH = Math.max(prevSize.height, defH);
      const effCurrH = Math.max(currSize.height, defH);
      const minDist = effPrevH / 2 + effCurrH / 2 + MIN_V_GAP;
      if (currPos.y - prevPos.y < minDist) {
        positions.set(curr.id, { x: currPos.x, y: prevPos.y + minDist });
      }
    }

    // Re-centre column: shift so midpoint of [minY, maxY] aligns with y = 0
    const ys = colNodes.map(n => positions.get(n.id)!.y);
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    if (Math.abs(mid) > 0.5) {
      for (const node of colNodes) {
        const pos = positions.get(node.id)!;
        positions.set(node.id, { x: pos.x, y: pos.y - mid });
      }
    }
  }

  // ── Step 4: Position gate nodes at midpoint of their input nodes ──────────
  const gateNodes = [...gateIds]
    .map(id => nodes.find(n => n.id === id))
    .filter((n): n is FlowNode => n !== undefined);

  // Topological sort: process gates whose gate-inputs are all positioned first.
  const gateInDeg = new Map<string, number>();
  for (const id of gateIds) {
    const srcs = inEdges.get(id) ?? [];
    gateInDeg.set(id, srcs.filter(s => gateIds.has(s)).length);
  }

  const gateQueue = [...gateIds].filter(id => (gateInDeg.get(id) ?? 0) === 0);
  const topoGateIds: string[] = [];

  while (gateQueue.length > 0) {
    const id = gateQueue.shift()!;
    topoGateIds.push(id);
    for (const t of (outEdges.get(id) ?? [])) {
      if (!gateIds.has(t)) continue;
      const d = (gateInDeg.get(t) ?? 1) - 1;
      gateInDeg.set(t, d);
      if (d <= 0) gateQueue.push(t);
    }
  }
  // Append any remaining (cyclic) gates
  for (const id of gateIds) {
    if (!topoGateIds.includes(id)) topoGateIds.push(id);
  }

  for (const id of topoGateIds) {
    const srcYs = (inEdges.get(id) ?? [])
      .map(s => positions.get(s)?.y)
      .filter((y): y is number => y !== undefined);
    const y = srcYs.length > 0 ? srcYs.reduce((a, b) => a + b, 0) / srcYs.length : 0;
    positions.set(id, { x: COL_X[4], y });
  }

  // Resolve gate collisions (sort by y, push overlapping gates down).
  // Use actual node sizes so spacing is consistent with the final-pass PAD check.
  if (gateNodes.length > 1) {
    const sortedGates = [...gateNodes].sort(
      (a, b) => (positions.get(a.id)?.y ?? 0) - (positions.get(b.id)?.y ?? 0)
    );
    const sortedIds   = sortedGates.map(n => n.id);
    const gateSizeMap = new Map(
      sortedGates.map(n => [n.id, nodeSizeForType(n.type ?? 'default')])
    );
    resolveCollisionsInTier(sortedIds, positions, gateSizeMap);
  }

  // ── Step 5: Final pass — eliminate remaining per-column overlaps ──────────
  const PAD = 20;
  for (let iter = 0; iter < 10; iter++) {
    let anyFixed = false;
    for (const col of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const colNodes = col === 4
        ? gateNodes
        : (columns.get(col) ?? []);
      if (colNodes.length <= 1) continue;

      const sorted = [...colNodes].sort(
        (a, b) => (positions.get(a.id)?.y ?? 0) - (positions.get(b.id)?.y ?? 0)
      );
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const pp = positions.get(prev.id)!;
        const cp = positions.get(curr.id)!;
        if (!pp || !cp) continue;
        const ps = nodeSizeForType(prev.type ?? 'default');
        const cs = nodeSizeForType(curr.type ?? 'default');
        const prevBottom = pp.y + ps.height / 2 + PAD;
        const currTop    = cp.y - cs.height / 2;
        if (currTop < prevBottom) {
          const newY = prevBottom + cs.height / 2;
          // Only count as a real fix when the position actually changes (guards
          // against floating-point rounding producing the same float value).
          if (newY !== cp.y) {
            positions.set(curr.id, { x: cp.x, y: newY });
            anyFixed = true;
          }
        }
      }
    }
    if (!anyFixed) break;
  }

  // ── Dev-mode assertions ───────────────────────────────────────────────────
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

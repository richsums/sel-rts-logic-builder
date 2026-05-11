/**
 * @module graph/layout
 * Sugiyama-inspired hierarchical graph layout engine for SEL protection logic.
 *
 * Replaces the simple depth-column layout with a semantically-aware tier system
 * that maps relay signal types to fixed horizontal lanes, minimises edge crossings
 * with a barycenter heuristic, and enforces protection-priority vertical ordering.
 *
 * Tier assignment (left to right):
 *   0 – Input signals  (isInput nodes, 52A, COMM_IN, RxWI, binary inputs)
 *   1 – Pickup bits    (50P1P, 51P1P, 21P1P, 87LP, …)
 *   2 – Timer nodes    (51P1TC, 51G1TC, 21P2TC, 67P1TC, 79TC, …)
 *   3 – Trip word bits (50P1T, 51P1T, 21P1T, …)
 *   4 – Logic gates    (AND / OR / NOT combining word bits)
 *   5 – Supervisory    (AND gate combining trip logic + 52A / BLK guards)
 *   6 – Trip output    (TR, TRIP, CL, CLOSE)
 *
 * Within each tier nodes are ordered by protection priority:
 *   50 < 51 < 21 < 87 < 67 < 79 < other
 * then alphabetically within the same prefix group.
 *
 * Crossing minimisation: barycenter heuristic, 3 passes alternating
 * forward (tier 0 → 6) and backward (tier 6 → 0).
 *
 * Spacing: TIER_H_GAP px between tiers, NODE_V_GAP px minimum between nodes.
 */

import type { DependencyGraph, GraphNode } from '../selogic/graph';
import {
  isPickupBit,
  isTripWordBit,
  isTimerCounterNode,
} from './protection';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Horizontal gap between tier columns (px). */
export const TIER_H_GAP = 220;

/** Minimum vertical gap between nodes in the same tier (px). */
export const NODE_V_GAP = 120;

/** Number of barycenter crossing-minimisation passes. */
const BARY_PASSES = 3;

// ─── Tier identifiers ─────────────────────────────────────────────────────────

export type Tier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ─── Protection element priority ordering ─────────────────────────────────────

/** Lower number = higher priority = appears higher in the tier column. */
const PROTECTION_PRIORITY: Array<[RegExp, number]> = [
  [/^50/i, 0],
  [/^51/i, 1],
  [/^21/i, 2],
  [/^87/i, 3],
  [/^67/i, 4],
  [/^79/i, 5],
  [/^SEF/i, 6],
];

function protectionPriority(id: string): number {
  for (const [re, pri] of PROTECTION_PRIORITY) {
    if (re.test(id)) return pri;
  }
  return 99;
}

// ─── Tier assignment ──────────────────────────────────────────────────────────

/** Trip output IDs (case-insensitive). */
const TRIP_IDS = new Set(['TR', 'TRIP', 'CL', 'CLOSE']);

/**
 * Assign a display tier to a node based on its semantic role.
 *
 * The assignment uses node metadata (isInput, depth) and the ID naming conventions
 * from protection.ts rather than the raw depth value, so the layout is stable
 * across different relay configurations.
 */
export function assignTier(nodeId: string, node: GraphNode): Tier {
  const id = nodeId.toUpperCase();

  // Tier 6: trip outputs (checked first — TR / TRIP are never inputs)
  if (TRIP_IDS.has(id)) return 6;

  // Tier 2: timer-counter (TC) nodes — between pickup and trip word bit
  // Must be checked before isInput because TC nodes are not user inputs
  if (isTimerCounterNode(nodeId)) return 2;

  // Tier 1: pickup bits (protection element P suffix).
  // Pickup bits are flagged isInput in the DependencyGraph (user-toggleable),
  // but semantically belong in the pickup tier, not the raw input tier.
  if (isPickupBit(nodeId)) return 1;

  // Tier 3: trip word bits
  if (isTripWordBit(nodeId)) return 3;

  // Tier 0: all remaining input nodes (52A, COMM_IN, RxWI, binary inputs, etc.)
  if (node.isInput) return 0;

  // Tier 5: supervisory — top-level nodes that combine trip logic with
  // permissive/blocking signals (high depth, few dependents)
  const deps = node.dependencies;
  if (
    node.depth !== undefined &&
    node.depth >= 3 &&
    deps.length >= 2 &&
    (deps.some(d => TRIP_IDS.has(d.toUpperCase())) ||
      deps.some(d => isTripWordBit(d)))
  ) {
    // Skip if this is itself the final trip output (already caught above)
    return 5;
  }

  // Tier 6: very deep nodes that feed a trip output directly
  if (node.depth !== undefined && node.depth >= 5) return 6;

  // Tier 4: all remaining computed logic (gates, latches, SVx, TDx, etc.)
  return 4;
}

// ─── Within-tier comparator ───────────────────────────────────────────────────

/**
 * Comparator for stable initial within-tier ordering.
 * Sorts protection elements by priority group first, then alphabetically.
 */
function tierComparator(a: string, b: string): number {
  const pa = protectionPriority(a);
  const pb = protectionPriority(b);
  if (pa !== pb) return pa - pb;
  return a.localeCompare(b);
}

// ─── Barycenter heuristic ─────────────────────────────────────────────────────

/**
 * Compute the barycenter (average neighbour position) for a node in the given
 * tier direction.
 *
 * @param nodeId   Node to compute barycenter for
 * @param posInTier  Map: nodeId → current position index in its tier
 * @param graph    Full dependency graph
 * @param direction 'forward'  uses predecessors (nodes in tier-1)
 *                  'backward' uses successors  (nodes in tier+1)
 */
function barycenter(
  nodeId: string,
  posInTier: Map<string, number>,
  graph: DependencyGraph,
  direction: 'forward' | 'backward',
): number {
  const node = graph.nodes.get(nodeId);
  if (!node) return Infinity;

  const neighbours =
    direction === 'forward' ? node.dependencies : node.dependents ?? [];

  const positions = neighbours
    .map(n => posInTier.get(n))
    .filter((p): p is number => p !== undefined);

  if (positions.length === 0) return Infinity;
  return positions.reduce((a, b) => a + b, 0) / positions.length;
}

/**
 * One pass of the barycenter heuristic across all tiers in the given direction.
 * Reorders nodes within each tier to minimise crossings with the adjacent tier.
 */
function barycentrePass(
  tiers: Map<Tier, string[]>,
  graph: DependencyGraph,
  direction: 'forward' | 'backward',
): void {
  const allTiers = Array.from(tiers.keys()).sort((a, b) => a - b);
  const iterOrder = direction === 'forward' ? allTiers : [...allTiers].reverse();

  // Build global position map once per pass
  const posInTier = new Map<string, number>();
  for (const [, ids] of tiers) {
    ids.forEach((id, idx) => posInTier.set(id, idx));
  }

  for (const tier of iterOrder) {
    const ids = tiers.get(tier);
    if (!ids || ids.length <= 1) continue;

    // Compute barycenter for each node
    const scored = ids.map(id => ({
      id,
      bc: barycenter(id, posInTier, graph, direction),
    }));

    // Sort by barycenter; nodes with no neighbours keep stable relative order
    scored.sort((a, b) => {
      if (a.bc === Infinity && b.bc === Infinity) return 0;
      if (a.bc === Infinity) return 1;
      if (b.bc === Infinity) return -1;
      return a.bc - b.bc;
    });

    const newIds = scored.map(s => s.id);
    tiers.set(tier, newIds);

    // Update position map for subsequent tiers in this pass
    newIds.forEach((id, idx) => posInTier.set(id, idx));
  }
}

// ─── Main layout function ─────────────────────────────────────────────────────

export interface LayoutPosition {
  x: number;
  y: number;
  tier: Tier;
}

/**
 * Compute the (x, y) position and tier for every node in the dependency graph.
 *
 * Algorithm:
 *   1. Assign each node to a tier (0–6) based on semantic role.
 *   2. Within each tier, apply the initial protection-priority ordering.
 *   3. Run BARY_PASSES alternating forward/backward barycenter passes to
 *      reduce edge crossings.
 *   4. Emit final (x, y) coordinates: x = tier × TIER_H_GAP,
 *      y centred around 0 with NODE_V_GAP between nodes.
 *
 * @param graph   Dependency graph to lay out.
 * @returns       Map from node ID to { x, y, tier }.
 */
export function computeLayout(graph: DependencyGraph): Map<string, LayoutPosition> {
  // ── Step 1: Tier assignment ──────────────────────────────────────────────
  const tiers = new Map<Tier, string[]>([
    [0, []], [1, []], [2, []], [3, []], [4, []], [5, []], [6, []],
  ]);

  for (const [id, node] of graph.nodes) {
    const tier = assignTier(id, node);
    tiers.get(tier)!.push(id);
  }

  // ── Step 2: Initial protection-priority ordering ─────────────────────────
  for (const [, ids] of tiers) {
    ids.sort(tierComparator);
  }

  // ── Step 3: Barycenter crossing minimisation ─────────────────────────────
  for (let pass = 0; pass < BARY_PASSES; pass++) {
    barycentrePass(tiers, graph, pass % 2 === 0 ? 'forward' : 'backward');
  }

  // ── Step 4: Emit coordinates ──────────────────────────────────────────────
  const positions = new Map<string, LayoutPosition>();

  for (const [tier, ids] of tiers) {
    const count = ids.length;
    ids.forEach((id, idx) => {
      positions.set(id, {
        x: tier * TIER_H_GAP,
        y: (idx - (count - 1) / 2) * NODE_V_GAP,
        tier,
      });
    });
  }

  return positions;
}

// ─── Tier membership queries ──────────────────────────────────────────────────

/**
 * Returns all node IDs assigned to a given tier in the computed layout.
 */
export function nodesInTier(
  positions: Map<string, LayoutPosition>,
  tier: Tier,
): string[] {
  return Array.from(positions.entries())
    .filter(([, pos]) => pos.tier === tier)
    .map(([id]) => id);
}

/**
 * @module graph/propagate
 * Pure logic-simulation engine for the SELogic dependency graph.
 * No React imports — safe to use in tests and worker contexts.
 */

import type { DependencyGraph } from '../selogic/graph';
import type { ASTNode } from '../selogic/ast';
import { parseExpression } from '../selogic/parser';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Map of signal name → logical state (0 = de-asserted, 1 = asserted). */
export type SignalStates = Record<string, 0 | 1>;

export interface PropagateResult {
  newStates: SignalStates;
  /** IDs of all nodes whose state changed (includes both overrides and downstream). */
  affected: string[];
  /** Nodes in topological order (inputs first, outputs last). */
  sortedOrder: string[];
}

// ─── AST Evaluator ────────────────────────────────────────────────────────────

/**
 * Evaluate a SELogic AST node to a logical 0 or 1 given the current signal states.
 * EDGE (^) is treated as a pass-through for simulation purposes (no rising-edge memory).
 */
export function evaluateAST(node: ASTNode, states: SignalStates): 0 | 1 {
  switch (node.type) {
    case 'Literal':
      return node.value;
    case 'Operand':
      return states[node.name] ?? 0;
    case 'UnaryOp':
      if (node.op === 'NOT')  return evaluateAST(node.operand, states) === 0 ? 1 : 0;
      if (node.op === 'EDGE') return evaluateAST(node.operand, states);
      return 0;
    case 'BinaryOp': {
      const l = evaluateAST(node.left,  states);
      const r = evaluateAST(node.right, states);
      if (node.op === 'AND') return (l === 1 && r === 1) ? 1 : 0;
      if (node.op === 'OR')  return (l === 1 || r === 1) ? 1 : 0;
      if (node.op === 'XOR') return l !== r ? 1 : 0;
      return 0;
    }
  }
}

// ─── Topological Sort ─────────────────────────────────────────────────────────

/**
 * Kahn's algorithm topological sort of all graph nodes.
 * Returns node IDs ordered from inputs (depth 0) to outputs (deepest).
 * Handles cycles gracefully by including remaining nodes at end.
 */
export function topologicalSort(graph: DependencyGraph): string[] {
  const inDeg = new Map<string, number>();
  for (const [id, node] of graph.nodes) {
    inDeg.set(id, node.dependencies.length);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) queue.push(id);
  }
  // Stable sort within same depth by ID for deterministic output
  queue.sort();

  const result: string[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    result.push(id);

    const node = graph.nodes.get(id);
    if (node) {
      const nextBatch: string[] = [];
      for (const depId of node.dependents) {
        const newDeg = (inDeg.get(depId) ?? 1) - 1;
        inDeg.set(depId, newDeg);
        if (newDeg <= 0) nextBatch.push(depId);
      }
      nextBatch.sort();
      queue.push(...nextBatch);
    }
  }

  // Include any nodes not visited (cycle members) at the end
  for (const id of graph.nodes.keys()) {
    if (!visited.has(id)) result.push(id);
  }

  return result;
}

// ─── Initial States ───────────────────────────────────────────────────────────

/** Return a fresh state map with all signals set to 0. */
export function initialSignalStates(graph: DependencyGraph): SignalStates {
  const states: SignalStates = {};
  for (const id of graph.nodes.keys()) states[id] = 0;
  return states;
}

// ─── Propagation Engine ───────────────────────────────────────────────────────

/**
 * Apply a set of signal overrides and propagate their effects through the graph.
 *
 * Algorithm:
 *   1. Apply overrides to a copy of baseStates
 *   2. Walk nodes in topological order
 *   3. For each computed node (has an equation, not an input), re-evaluate its AST
 *   4. If the computed value differs from the current value, record the change
 *
 * @param baseStates   Current signal states before the toggle
 * @param overrides    New values for signals being toggled (user action)
 * @param graph        Dependency graph providing node topology and equations
 * @returns            New states, set of changed node IDs, topological order used
 */
export function propagate(
  baseStates: SignalStates,
  overrides: Record<string, 0 | 1>,
  graph: DependencyGraph,
): PropagateResult {
  const sorted = topologicalSort(graph);
  const newStates: SignalStates = { ...baseStates };
  const changed = new Set<string>();

  // Step 1: Apply overrides
  for (const [k, v] of Object.entries(overrides)) {
    if (newStates[k] !== v) changed.add(k);
    newStates[k] = v;
  }

  // Step 2: Propagate forward in topological order
  for (const id of sorted) {
    const node = graph.nodes.get(id);
    if (!node || node.isInput || !node.equation) continue;

    const ast = parseExpression(node.equation.expression);
    if (!ast) continue;

    const computed = evaluateAST(ast, newStates);
    if (computed !== (newStates[id] ?? 0)) {
      newStates[id] = computed;
      changed.add(id);
    }
  }

  return {
    newStates,
    affected: [...changed],
    sortedOrder: sorted,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Determine whether a node is user-toggleable in simulation mode.
 * Inputs and protection element pickup signals are toggleable.
 * Computed logic outputs (AND/OR trees, timers, latches) are read-only.
 */
export function isToggleable(nodeId: string, graph: DependencyGraph): boolean {
  const node = graph.nodes.get(nodeId);
  if (!node) return false;
  // Input nodes (no defining equation) are always toggleable
  if (node.isInput) return true;
  // Protection elements with no equation or flagged as inputs
  const id = nodeId.toUpperCase();
  if (/^(51|50|21|87|67|79|SEF|Z\d)/.test(id)) return true;
  return false;
}

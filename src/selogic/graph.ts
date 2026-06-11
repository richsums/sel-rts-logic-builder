import type { LogicEquation } from '../relay-adapters/common/types';
import { parseExpression } from './parser';
import { collectSignals } from './ast';

// ─── Graph Types ──────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;           // signal name
  label: string;
  description: string;
  equation?: LogicEquation;
  isInput: boolean;     // true = external/hardware input (no defining equation)
  isOutput: boolean;    // true = drives a physical output or trip
  dependencies: string[];   // signal names this node depends on
  dependents: string[];     // signal names that depend on this node
  depth: number;        // topological depth (0 = raw inputs)
}

export interface DependencyGraph {
  nodes: Map<string, GraphNode>;
  roots: string[];      // nodes with no dependencies
  leaves: string[];     // nodes with no dependents
}

// ─── Graph Builder ────────────────────────────────────────────────────────────

const HARDWARE_INPUTS = new Set([
  'IN101','IN102','IN103','IN104','IN105','IN106',
  '52A','52B','3S2','50P1','50P2','50G1','50G2',
  '51P1','51G1','51N1','67P1','67G1',
  '25','27','59','81','TRIP','CLOSE',
  // Common internal bits that are "inputs" to logic
]);

function isLikelyInput(name: string): boolean {
  if (HARDWARE_INPUTS.has(name)) return true;
  if (/^IN\d+$/.test(name)) return true;        // INxxx
  if (/^\d+(P|G|N|Q)\d*$/.test(name)) return true; // element pickups
  if (/^R\d+$/.test(name)) return true;           // remote bits
  if (name.length <= 2 && /^\d+$/.test(name)) return true;
  return false;
}

function isLikelyOutput(name: string): boolean {
  if (/^OUT\d+$/.test(name)) return true;
  if (/^TR$|^TRIP$|^CL$|^CLOSE$|^ALARM$/.test(name)) return true;
  return false;
}

export function buildDependencyGraph(equations: LogicEquation[]): DependencyGraph {
  const defined = new Set(equations.map(e => e.label));
  const nodes = new Map<string, GraphNode>();

  // First pass: create nodes for all defined labels
  for (const eq of equations) {
    const ast = parseExpression(eq.expression);
    const deps = ast ? Array.from(collectSignals(ast)) : [];

    nodes.set(eq.label, {
      id: eq.label,
      label: eq.label,
      description: eq.description,
      equation: eq,
      isInput: false,
      isOutput: isLikelyOutput(eq.label),
      dependencies: deps,
      dependents: [],
      depth: 0,
    });
  }

  // Second pass: add input nodes for referenced signals not in defined set
  for (const node of nodes.values()) {
    for (const dep of node.dependencies) {
      if (!nodes.has(dep)) {
        nodes.set(dep, {
          id: dep,
          label: dep,
          description: `Input signal: ${dep}`,
          isInput: true,
          isOutput: false,
          dependencies: [],
          dependents: [],
          depth: 0,
        });
      }
      // Build reverse edges
      const depNode = nodes.get(dep)!;
      if (!depNode.dependents.includes(node.id)) {
        depNode.dependents.push(node.id);
      }
    }
  }

  // Synthesize SV timed-bit links: a referenced `SVnT` (timed word bit) tracks
  // its raw `SVn` SELOGIC variable through the PU/DO timer. This connects the
  // SV's upstream logic to the SVnT bit and lets simulation propagate SVn→SVnT.
  for (const [id, node] of nodes) {
    if (!/^SV\d+T$/i.test(id) || !node.isInput) continue;
    const base = id.replace(/T$/i, '');
    const baseNode = nodes.get(base);
    if (!baseNode) continue;
    node.isInput = false;
    node.dependencies = [base];
    node.description = `${base} timed output (PU/DO)`;
    node.equation = {
      label: id,
      expression: base,
      description: node.description,
      source: baseNode.equation?.source ?? { sourceFile: '', lineNumber: 0, rawText: '' },
      functionType: 'TIMER_OUT',
    };
    if (!baseNode.dependents.includes(id)) baseNode.dependents.push(id);
  }

  // Third pass: compute topological depth via BFS from roots
  const roots = Array.from(nodes.values())
    .filter(n => n.dependencies.length === 0)
    .map(n => n.id);

  const queue = [...roots];
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodes.get(id)!;
    for (const dep of node.dependents) {
      const depNode = nodes.get(dep)!;
      depNode.depth = Math.max(depNode.depth, node.depth + 1);
      queue.push(dep);
    }
  }

  const leaves = Array.from(nodes.values())
    .filter(n => n.dependents.length === 0)
    .map(n => n.id);

  return { nodes, roots, leaves };
}

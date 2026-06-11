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
  /**
   * Set for nodes synthesized from SEL conventions rather than explicit equations:
   *  'seal'  — TRIP/CLOSE word bit (asserts with TR/CL, seals in until ULTR/ULCL)
   *  'latch' — LTn latch bit driven by SETn/RSTn (RST-dominant)
   *  'svt'   — SVnT timed bit fed by SVn through the PU/DO timer
   * Rendering draws these with direct labelled input pins instead of gate trees.
   */
  synthetic?: 'seal' | 'latch' | 'svt';
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

  // ── Synthesis from SEL conventions ──────────────────────────────────────────
  // Several SEL-351 word bits have no explicit defining equation in the settings
  // file but follow fixed internal logic. Synthesize them so the graph shows the
  // complete chain and simulation propagates through it.

  const NO_SRC = { sourceFile: '', lineNumber: 0, rawText: '' };
  const isLive = (n?: GraphNode): boolean =>
    !!n?.equation && !/^\s*0\s*$/.test(n.equation.expression);
  const wire = (depId: string, nodeId: string) => {
    const dep = nodes.get(depId);
    if (dep && !dep.dependents.includes(nodeId)) dep.dependents.push(nodeId);
  };

  // 1. SVnT timed bits: SVn (SELOGIC variable) → PU/DO timer → SVnT.
  for (const [id, node] of nodes) {
    if (!/^SV\d+T$/i.test(id) || !node.isInput) continue;
    const base = id.replace(/T$/i, '');
    const baseNode = nodes.get(base);
    if (!baseNode) continue;
    node.isInput = false;
    node.synthetic = 'svt';
    node.dependencies = [base];
    node.description = `${base} timed output (PU/DO)`;
    node.equation = {
      label: id, expression: base, description: node.description,
      source: baseNode.equation?.source ?? NO_SRC, functionType: 'TIMER_OUT',
    };
    wire(base, id);
  }

  // 2. LTn latch bits: driven by SETn/RSTn (or LTnS/LTnR). RST-dominant per
  //    the SEL-351 latch-control model: LTn = !RSTn * (SETn + LTn).
  //    The self-reference reads the previous scan's value, giving real seal-in.
  for (const [id, node] of nodes) {
    const m = id.match(/^LT(\d+)$/i);
    if (!m || !node.isInput) continue;
    const setNode = [nodes.get(`SET${m[1]}`), nodes.get(`LT${m[1]}S`)].find(isLive);
    const rstNode = [nodes.get(`RST${m[1]}`), nodes.get(`LT${m[1]}R`)].find(isLive);
    if (!setNode) continue;
    const deps = rstNode ? [setNode.id, rstNode.id] : [setNode.id];
    const expr = rstNode
      ? `!${rstNode.id}*(${setNode.id}+${id})`
      : `${setNode.id}+${id}`;
    node.isInput = false;
    node.synthetic = 'latch';
    node.dependencies = deps;
    node.description = `Latch bit ${id} (SET/RST, reset-dominant)`;
    node.equation = {
      label: id, expression: expr, description: node.description,
      source: setNode.equation?.source ?? NO_SRC, functionType: 'LATCH_SET',
    };
    for (const d of deps) wire(d, id);
  }

  // 3. TRIP / CLOSE word bits: assert with the TR / CL equation and seal in
  //    until the corresponding unlatch equation (ULTR / ULCL) asserts.
  const sealPairs: Array<[string, string, string]> = [
    ['TRIP', 'TR', 'ULTR'],
    ['CLOSE', 'CL', 'ULCL'],
  ];
  for (const [bit, drv, ul] of sealPairs) {
    const node = nodes.get(bit);
    const drvNode = nodes.get(drv);
    if (!node || !node.isInput || !isLive(drvNode)) continue;
    const ulNode = isLive(nodes.get(ul)) ? nodes.get(ul)! : null;
    const deps = ulNode ? [drv, ul] : [drv];
    const expr = ulNode ? `${drv}+${bit}*!${ul}` : drv;
    node.isInput = false;
    node.isOutput = true;
    node.synthetic = 'seal';
    node.dependencies = deps;
    node.description = ulNode
      ? `${bit} word bit — asserts with ${drv}, seals in until ${ul}`
      : `${bit} word bit — follows ${drv}`;
    node.equation = {
      label: bit, expression: expr, description: node.description,
      source: drvNode!.equation?.source ?? NO_SRC,
      functionType: bit === 'TRIP' ? 'TRIP' : 'OUTPUT',
    };
    for (const d of deps) wire(d, bit);
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

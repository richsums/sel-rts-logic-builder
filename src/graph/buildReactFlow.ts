/**
 * @module graph/buildReactFlow
 * Converts a DependencyGraph into React Flow nodes and edges.
 *
 * Improvements over the legacy buildLayout in GraphViewer.tsx:
 *  - Gate signal nodes use SVG symbols (andGate / orGate / notGate / edgeGate)
 *  - Complex expressions get AST-decomposed into intermediate gate nodes placed
 *    between the input signals and the target signal node
 *  - Trip word bit (T-bit) protection nodes get amber border styling via
 *    NodeDisplayInfo.isTripWordBit
 */

import { MarkerType, Position, type Node, type Edge } from 'reactflow';
import type { DependencyGraph } from '../selogic/graph';
import type { ParsedRelaySettings } from '../relay-adapters/common/types';
import { parseExpression } from '../selogic/parser';
import type { ASTNode, BinaryOpNode } from '../selogic/ast';
import { extractDisplaySettings, type NodeDisplayInfo } from './displaySettings';
import type { GraphNodeData, OutputContactNodeData } from './nodes';
import type { GateNodeData, GateType } from './nodes';
import type { AnimatedLogicEdgeData } from './edges';
import type { SignalStates } from './propagate';
import { isPickupBit, isTripWordBit, timerNodeId } from './protection';
import { computeLayout } from './layout';

// ─── Output contact parsing ───────────────────────────────────────────────────

/**
 * Parse output contact assignments from relay settings groups.
 * Looks for entries with keys matching OUTxxx pattern.
 * Returns a map of output name → expression (e.g. "OUT101" → "TR").
 */
export function parseOutputContacts(relay: ParsedRelaySettings | null): Map<string, string> {
  const result = new Map<string, string>();
  if (!relay) return result;
  // ALRMOUT is the SEL-351S alarm output contact — treat it like OUTxxx.
  const CONTACT_RE = /^(OUT\d+|ALRMOUT)$/i;
  for (const group of relay.settingGroups) {
    for (const entry of group.entries) {
      if (CONTACT_RE.test(entry.key)) {
        result.set(entry.key.toUpperCase(), entry.value);
      }
    }
  }
  // Also check logicEquations for OUTPUT/ALARM contact labels
  for (const eq of relay.logicEquations) {
    if (CONTACT_RE.test(eq.label) && (eq.functionType === 'OUTPUT' || eq.functionType === 'ALARM')) {
      result.set(eq.label.toUpperCase(), eq.expression);
    }
  }
  return result;
}

// ─── Layout constants ─────────────────────────────────────────────────────────

export const NODE_H_GAP    = 220;   // horizontal gap between depth columns
export const NODE_V_GAP    = 120;   // vertical gap between nodes in same column
export const GATE_H_OFFSET = 90;    // x-offset per gate level (right → left)

// ─── Internal helpers ─────────────────────────────────────────────────────────

function reactFlowNodeType(info: NodeDisplayInfo, nodeId: string): string {
  // Output contacts (OUTxxx / ALRMOUT) get special node type regardless of display kind
  if (/^(OUT\d+|ALRMOUT)$/i.test(nodeId)) return 'outputContactNode';
  switch (info.kind) {
    case 'protection': return 'protectionElement';
    case 'timer':      return 'timerNode';
    case 'latch':      return 'latchNode';
    case 'gate':       return 'logicGateNode';
    case 'input':      return 'inputSignalNode';
    case 'trip':       return 'tripOutputNode';
    default:           return 'logicGateNode';
  }
}

function binaryOpToGateType(op: string): GateType {
  if (op === 'OR') return 'or';
  return 'and'; // AND and XOR both map to AND symbol (XOR is rare in SEL)
}

function unaryOpToGateType(op: string): GateType {
  return op === 'EDGE' ? 'edge' : 'not';
}

function gateNodeType(gt: GateType): string {
  return `${gt}Gate`;
}

// ─── AST decomposition context ────────────────────────────────────────────────

interface DecompCtx {
  gateNodes:    Node<GateNodeData>[];
  gateEdges:    Edge<AnimatedLogicEdgeData>[];
  signalStates: SignalStates;
  seenEdgeIds:  Set<string>;
  counter:      { n: number };
}

/**
 * Recursively decomposes an AST subtree into intermediate gate nodes.
 *
 * Returns the ID of the node/gate whose output should be wired as input
 * to the parent gate (or the final signal node).
 *
 * Leaf (Operand) → returns the signal name directly.
 * Compound (BinaryOp / UnaryOp) → creates a gate node and returns its ID.
 */
/**
 * Flatten an associative chain of the same binary operator into its operand
 * list, so `A+B+C+D+E` becomes ONE 5-input OR gate instead of a cascade of
 * four 2-input gates. Cleaner diagram, easier to read against the equation.
 */
function flattenSameOp(ast: ASTNode, op: string, out: ASTNode[]): void {
  if (ast.type === 'BinaryOp' && ast.op === op) {
    flattenSameOp(ast.left, op, out);
    flattenSameOp(ast.right, op, out);
  } else {
    out.push(ast);
  }
}

function decomposeSubtree(
  ast:      ASTNode,
  parentId: string,
  x:        number,
  y:        number,
  ctx:      DecompCtx,
): string {
  // ── Leaf nodes ────────────────────────────────────────────────────────────
  if (ast.type === 'Operand') return ast.name;
  if (ast.type === 'Literal') return `__lit_${ast.value}__`;

  const gateId = `g_${parentId}_${ctx.counter.n++}`;

  // ── UnaryOp (NOT / EDGE) ──────────────────────────────────────────────────
  if (ast.type === 'UnaryOp') {
    const gt      = unaryOpToGateType(ast.op);
    const inputId = decomposeSubtree(ast.operand, gateId, x - GATE_H_OFFSET, y, ctx);

    ctx.gateNodes.push(makeGateNode(gateId, gt, 1, x, y, ctx.signalStates[inputId] ?? 0));
    pushGateEdge(inputId, 'in0', gateId, ctx);
    return gateId;
  }

  // ── BinaryOp (AND / OR / XOR) — flattened to one n-input gate ─────────────
  const bop = ast as BinaryOpNode;
  const gt  = binaryOpToGateType(bop.op);
  const operands: ASTNode[] = [];
  flattenSameOp(bop, bop.op, operands);

  const childIds = operands.map((operand, k) =>
    decomposeSubtree(
      operand, gateId,
      x - GATE_H_OFFSET,
      y + (k - (operands.length - 1) / 2) * 36,
      ctx,
    ),
  );

  const states = childIds.map(cid => (ctx.signalStates[cid] ?? 0) as 0 | 1);
  const outSt: 0 | 1 = gt === 'or'
    ? (states.some(s => s === 1) ? 1 : 0)
    : (states.every(s => s === 1) ? 1 : 0);

  ctx.gateNodes.push(makeGateNode(gateId, gt, operands.length, x, y, outSt));
  childIds.forEach((cid, k) => pushGateEdge(cid, `in${k}`, gateId, ctx));
  return gateId;
}

function makeGateNode(
  id: string, gt: GateType, inputCount: number,
  x: number, y: number, signalState: 0 | 1,
): Node<GateNodeData> {
  return {
    id,
    type:           gateNodeType(gt),
    position:       { x, y },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: { gateType: gt, inputCount, signalState, animState: 'idle' },
  };
}

function pushGateEdge(
  source: string, targetHandle: string, target: string, ctx: DecompCtx,
): void {
  // Skip literal placeholders
  if (source.startsWith('__lit_')) return;
  const eid = `${source}_${targetHandle}->${target}`;
  if (ctx.seenEdgeIds.has(eid)) return;
  ctx.seenEdgeIds.add(eid);
  ctx.gateEdges.push({
    id:           eid,
    source,
    target,
    targetHandle,
    type:         'animatedLogic',
    markerEnd:    { type: MarkerType.ArrowClosed, width: 8, height: 8, color: '#94a3b8' },
    data:         { state: (ctx.signalStates[source] ?? 0) as 0 | 1, isNot: false, pulsing: false },
  });
}

// ─── Main layout builder ──────────────────────────────────────────────────────

/**
 * Build the complete React Flow node + edge arrays from a DependencyGraph.
 *
 * Signal nodes are positioned in depth columns (inputs left, trip outputs right).
 * For signal nodes with complex equations (BinaryOp / UnaryOp at the root),
 * intermediate gate nodes are inserted between their inputs and themselves.
 *
 * @param graph          The dependency graph (from buildDependencyGraph)
 * @param relay          Parsed relay settings (null → defaults / blank display)
 * @param signalStates   Current signal states for colouring
 * @param onToggle       Toggle callback for user-interactive nodes
 */
export function buildReactFlowLayout(
  graph:        DependencyGraph,
  relay:        ParsedRelaySettings | null,
  signalStates: SignalStates,
  onToggle:     (nodeId: string, value: 0 | 1) => void,
  nodeFilter?:  Set<string>,
): { nodes: Node[]; edges: Edge[] } {

  // When a nodeFilter is supplied, only build the subgraph it names (used to
  // render one logic area). `inArea` gates every node/contact we emit.
  const inArea = (id: string): boolean => !nodeFilter || nodeFilter.has(id);

  // ── Assign column positions ────────────────────────────────────────────────
  const depthGroups = new Map<number, string[]>();
  for (const [id, node] of graph.nodes) {
    if (!inArea(id)) continue;
    const d = node.depth;
    if (!depthGroups.has(d)) depthGroups.set(d, []);
    depthGroups.get(d)!.push(id);
  }
  const depths = Array.from(depthGroups.keys()).sort((a, b) => a - b);
  const posOf  = new Map<string, { x: number; y: number }>();

  for (const depth of depths) {
    const ids = depthGroups.get(depth)!.sort();
    ids.forEach((id, idx) => {
      posOf.set(id, {
        x: depth * NODE_H_GAP,
        y: (idx - (ids.length - 1) / 2) * NODE_V_GAP,
      });
    });
  }

  // ── Shared decomposition context ──────────────────────────────────────────
  const ctx: DecompCtx = {
    gateNodes:    [],
    gateEdges:    [],
    signalStates,
    seenEdgeIds:  new Set<string>(),
    counter:      { n: 0 },
  };

  const signalNodes: Node[] = [];
  const signalEdges: Edge[] = [];
  const seenSignalEdgeIds = new Set<string>();

  // ── Pre-pass: collect TC nodes for timed protection elements ─────────────
  // For every pickup bit (e.g. 51P1P) that has a corresponding trip word bit
  // (51P1T) in the graph, insert a virtual timer-counter (TC) node (51P1TC)
  // between them.  TC nodes live in the DependencyGraph only as display nodes;
  // they are synthesised here and not present in graph.nodes.
  const tcNodes: Node[]  = [];
  const tcEdges: Edge[]  = [];

  for (const [id] of graph.nodes) {
    if (!isPickupBit(id)) continue;
    if (!inArea(id)) continue;                       // outside this area
    const tcId   = timerNodeId(id);
    if (!tcId) continue;                             // instantaneous — no TC

    const tripId = id.slice(0, -1) + 'T';
    if (!graph.nodes.has(tripId)) continue;          // trip word bit not in graph
    if (!inArea(tripId)) continue;                   // trip bit not in this area

    const pickupPos = posOf.get(id)  ?? { x: 0, y: 0 };
    const tripPos   = posOf.get(tripId) ?? { x: NODE_H_GAP * 2, y: 0 };

    // Position TC node midway between pickup and trip word bit
    const tcPos = {
      x: (pickupPos.x + tripPos.x) / 2,
      y: (pickupPos.y + tripPos.y) / 2,
    };

    // TC display info (timer kind)
    const tcDisplayInfo = extractDisplaySettings(tcId, graph, relay);

    tcNodes.push({
      id:             tcId,
      type:           'timerNode',
      position:       tcPos,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        nodeId:      tcId,
        displayInfo: tcDisplayInfo,
        signalState: (signalStates[tcId] ?? 0) as 0 | 1,
        animState:   'idle',
        onToggle,
      } as GraphNodeData,
    });

    // Pickup → TC edge (amber dashes while timing)
    const e1 = `${id}->${tcId}`;
    if (!seenSignalEdgeIds.has(e1)) {
      seenSignalEdgeIds.add(e1);
      tcEdges.push({
        id:        e1,
        source:    id,
        target:    tcId,
        type:      'animatedLogic',
        markerEnd: { type: MarkerType.ArrowClosed, width: 8, height: 8, color: '#f59e0b' },
        data:      { state: (signalStates[id] ?? 0) as 0 | 1, isNot: false, pulsing: false },
      });
    }

    // TC → Trip word bit edge (white surge on trip, then green)
    const e2 = `${tcId}->${tripId}`;
    if (!seenSignalEdgeIds.has(e2)) {
      seenSignalEdgeIds.add(e2);
      tcEdges.push({
        id:        e2,
        source:    tcId,
        target:    tripId,
        type:      'animatedLogic',
        markerEnd: { type: MarkerType.ArrowClosed, width: 8, height: 8, color: '#94a3b8' },
        data:      { state: (signalStates[tripId] ?? 0) as 0 | 1, isNot: false, pulsing: false },
      });
    }
  }

  // ── Build signal nodes + wire edges ───────────────────────────────────────
  for (const [id, gn] of graph.nodes) {
    if (!inArea(id)) continue;
    const pos         = posOf.get(id) ?? { x: 0, y: 0 };
    const displayInfo = extractDisplaySettings(id, graph, relay);
    const nodeType    = reactFlowNodeType(displayInfo, id);

    // Output contact nodes (OUTxxx) get OutputContactNodeData, not GraphNodeData
    if (nodeType === 'outputContactNode') {
      signalNodes.push({
        id,
        type:           'outputContactNode',
        position:       pos,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          nodeId:      id,
          expression:  gn.equation?.expression ?? id,
          signalState: (signalStates[id] ?? 0) as 0 | 1,
          animState:   'idle',
        } as OutputContactNodeData,
      });
    } else {
    signalNodes.push({
      id,
      type:           nodeType,
      position:       pos,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        nodeId:      id,
        displayInfo,
        signalState: (signalStates[id] ?? 0) as 0 | 1,
        animState:   'idle',
        // Synthesized latch/seal nodes show labelled SET / RST(UL) input pins.
        pins: gn.synthetic === 'latch' || gn.synthetic === 'seal' ? gn.synthetic : undefined,
        onToggle,
      } as GraphNodeData,
    });
    }

    const expr = gn.equation?.expression ?? '';
    const ast  = expr ? parseExpression(expr) : null;

    if (gn.synthetic === 'latch' || gn.synthetic === 'seal') {
      // ── Synthesized latch / seal node: direct edges onto labelled pins ────
      // (skip AST decomposition — the seal-in self-reference is sim-only).
      const SET_DEP = /^(SET\d+|LT\d+S|SV\d+S|TR|CL)$/i;
      for (const dep of gn.dependencies) {
        const eid = `${dep}->${id}`;
        if (seenSignalEdgeIds.has(eid)) continue;
        seenSignalEdgeIds.add(eid);
        signalEdges.push({
          id:           eid,
          source:       dep,
          target:       id,
          targetHandle: SET_DEP.test(dep) ? 'set' : 'rst',
          type:         'animatedLogic',
          markerEnd:    { type: MarkerType.ArrowClosed, width: 10, height: 10, color: '#94a3b8' },
          data:         { state: (signalStates[dep] ?? 0) as 0 | 1, isNot: false, pulsing: false },
        });
      }
    } else if (ast && (ast.type === 'BinaryOp' || ast.type === 'UnaryOp')) {
      // ── Complex equation: decompose AST into gate nodes ──────────────────
      // Gate root sits one step to the left of the target signal node
      const gateRootId = decomposeSubtree(
        ast, id,
        pos.x - GATE_H_OFFSET,
        pos.y,
        ctx,
      );

      // Wire the top-level gate's output to the signal node
      const eid = `${gateRootId}->${id}`;
      if (!seenSignalEdgeIds.has(eid)) {
        seenSignalEdgeIds.add(eid);
        signalEdges.push({
          id:        eid,
          source:    gateRootId,
          target:    id,
          type:      'animatedLogic',
          markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: '#94a3b8' },
          data:      {
            state:   (signalStates[id] ?? 0) as 0 | 1,
            isNot:   false,
            pulsing: false,
          },
        });
      }
    } else {
      // ── Simple / no equation: direct dependency edges ─────────────────────
      for (const dep of gn.dependencies) {
        // If a TC node is inserted between dep (pickup) and id (trip word bit),
        // skip the direct edge — the TC node chain handles it.
        if (isPickupBit(dep) && isTripWordBit(id)) {
          const tcId = timerNodeId(dep);
          if (tcId && seenSignalEdgeIds.has(`${tcId}->${id}`)) continue;
        }

        const isNot = expr.toUpperCase().includes(`!${dep.toUpperCase()}`);
        const eid   = `${dep}->${id}`;
        if (!seenSignalEdgeIds.has(eid)) {
          seenSignalEdgeIds.add(eid);
          signalEdges.push({
            id:        eid,
            source:    dep,
            target:    id,
            type:      'animatedLogic',
            markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: '#94a3b8' },
            data:      {
              state:   (signalStates[dep] ?? 0) as 0 | 1,
              isNot,
              pulsing: false,
            },
          });
        }
      }
    }
  }

  // ── Output contact nodes (OUTxxx) ────────────────────────────────────────
  const outputContacts = parseOutputContacts(relay);
  const outputContactNodes: Node[] = [];
  const outputContactEdges: Edge[] = [];
  const OUT_TIER_X = depths.length > 0
    ? (Math.max(...depths) + 2) * NODE_H_GAP
    : NODE_H_GAP * 6;  // Rightmost tier

  let outIdx = 0;
  const outCount = outputContacts.size;
  for (const [outId, expr] of outputContacts) {
    // Restrict to contacts belonging to the current area (if filtering).
    if (!inArea(outId)) { outIdx++; continue; }
    // Only create output contact nodes if not already in graph
    if (graph.nodes.has(outId)) { outIdx++; continue; }

    const yPos = (outIdx - (outCount - 1) / 2) * NODE_V_GAP;

    outputContactNodes.push({
      id:             outId,
      type:           'outputContactNode',
      position:       { x: OUT_TIER_X, y: yPos },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        nodeId:      outId,
        expression:  expr,
        signalState: (signalStates[outId] ?? 0) as 0 | 1,
        animState:   'idle',
      } as OutputContactNodeData,
    });

    // Find the source signals in the expression and wire edges
    // Parse the expression to find referenced signals (typically TR, ALARM, etc.)
    const exprAst = parseExpression(expr);
    if (exprAst) {
      // Collect direct operands — wire from main signal to output contact
      const operands: string[] = [];
      function collectOps(node: ASTNode): void {
        if (node.type === 'Operand') { operands.push(node.name); return; }
        if (node.type === 'BinaryOp') { collectOps(node.left); collectOps(node.right); }
        if (node.type === 'UnaryOp') { collectOps(node.operand); }
      }
      collectOps(exprAst);

      // Wire from any source node that IS in the graph (skip latches/etc for simplicity)
      for (const src of operands) {
        if (!graph.nodes.has(src) && !signalNodes.find(n => n.id === src) && !tcNodes.find(n => n.id === src)) continue;
        const eid = `${src}->${outId}`;
        if (!seenSignalEdgeIds.has(eid)) {
          seenSignalEdgeIds.add(eid);
          outputContactEdges.push({
            id:        eid,
            source:    src,
            target:    outId,
            type:      'animatedLogic',
            markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: '#00ff88' },
            data:      {
              state:   (signalStates[src] ?? 0) as 0 | 1,
              isNot:   false,
              pulsing: false,
            },
          });
        }
      }
    }

    outIdx++;
  }

  // ── Merge gate nodes — deduplicate by ID ──────────────────────────────────
  const seenGateIds = new Set<string>();
  const dedupedGateNodes: Node[] = [];
  for (const gn of ctx.gateNodes) {
    if (!seenGateIds.has(gn.id)) {
      seenGateIds.add(gn.id);
      dedupedGateNodes.push(gn as Node);
    }
  }

  const allNodes = [...signalNodes, ...tcNodes, ...dedupedGateNodes, ...outputContactNodes];
  const allEdges = [...signalEdges, ...tcEdges, ...ctx.gateEdges, ...outputContactEdges];

  // ── Dev-only: warn about isolated nodes (zero incoming AND zero outgoing) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((import.meta as any).env?.DEV !== false) {
    const edgeSources = new Set(allEdges.map(e => e.source));
    const edgeTargets = new Set(allEdges.map(e => e.target));
    for (const n of allNodes) {
      const hasIncoming = edgeTargets.has(n.id);
      const hasOutgoing = edgeSources.has(n.id);
      if (!hasIncoming && !hasOutgoing) {
        // Skip intentional standalone nodes (output contacts with no source in graph)
        if (n.type !== 'outputContactNode') {
          console.error(`[SEL-Graph] Isolated node detected: "${n.id}" (type: ${n.type}) has no incoming or outgoing edges.`);
        }
      }
    }
  }

  // ── Apply column-based layout ─────────────────────────────────────────────
  // Run the column-based layout engine to replace the depth-based positions
  // computed earlier. This guarantees readable, non-overlapping node placement.
  const positioned = computeLayout(allNodes, allEdges);
  const positionMap = new Map(positioned.map(p => [p.id, p.position]));
  const layoutedNodes = allNodes.map(n => ({
    ...n,
    position: positionMap.get(n.id) ?? n.position,
  }));

  return { nodes: layoutedNodes, edges: allEdges };
}

// ─── Area-scoped id helper ────────────────────────────────────────────────────

/**
 * Strip an `areaId::` prefix to recover the logical signal id. Area-aware layouts
 * (see `areaLayout.ts`) clone shared signals into multiple areas using ids like
 * `area_OUT101::51P1T`; simulation/animation always index by the logical id.
 */
export function logicalIdOf(flowId: string): string {
  const i = flowId.indexOf('::');
  return i === -1 ? flowId : flowId.slice(i + 2);
}

// ─── State updaters ───────────────────────────────────────────────────────────

/**
 * Patch node data with fresh signal states + animation states.
 * Resolves the logical id from area-scoped flow ids so every duplicate instance
 * of a shared signal updates together. Gate nodes ('g_') and area frame nodes
 * are left unchanged.
 */
export function applySignalStatesToLayout(
  nodes:        Node[],
  signalStates: SignalStates,
  flashingNodes: Record<string, string>,
): Node[] {
  return nodes.map(n => {
    if (n.type === 'logicAreaNode') return n;          // area frame — no signal
    const lid = logicalIdOf(n.id);
    if (lid.startsWith('g_')) return n;                // gate: keep existing state
    return {
      ...n,
      data: {
        ...n.data,
        signalState: (signalStates[lid] ?? 0) as 0 | 1,
        animState:   flashingNodes[lid] ?? 'idle',
      },
    };
  });
}

/**
 * Patch edge data with fresh signal states + pulsing flags.
 * Gate edges (source or target starting with 'g_') are left unchanged.
 */
export function applyEdgeStatesToLayout(
  edges:         Edge[],
  signalStates:  SignalStates,
  pulsingEdgeIds: string[],
  graph:         DependencyGraph,
): Edge[] {
  const pulsingSet = new Set(pulsingEdgeIds);
  return edges.map(e => {
    const ls = logicalIdOf(e.source);
    const lt = logicalIdOf(e.target);
    // Animator emits pulses keyed by the logical `src->tgt` edge; match either
    // the literal flow-edge id or the logical key so all duplicates pulse.
    const pulsing = pulsingSet.has(e.id) || pulsingSet.has(`${ls}->${lt}`);
    // Gate edges: just update pulsing
    if (ls.startsWith('g_') || lt.startsWith('g_')) {
      return { ...e, data: { ...e.data, pulsing } };
    }
    const gn    = graph.nodes.get(lt);
    const expr  = gn?.equation?.expression ?? '';
    const isNot = expr.toUpperCase().includes(`!${ls.toUpperCase()}`);
    return {
      ...e,
      data: {
        state:   (signalStates[ls] ?? 0) as 0 | 1,
        isNot,
        pulsing,
      },
    };
  });
}

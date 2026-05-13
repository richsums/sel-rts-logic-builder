/**
 * @module __tests__/graph-layout.test.ts
 *
 * Tests for:
 *  - protection.ts  — resolveTripWordBit, resolvePickupBit, isPickupBit, isTripWordBit,
 *                     elementBase, isInstantaneous, isTimeOvercurrent, isDistance, isDifferential
 *  - buildReactFlow.ts — gate node insertion from AST, position assignment, edge wiring
 *  - layout.ts — computeLayout: connection-aware vertical ordering, no-overlap guarantee
 */

import { describe, it, expect } from 'vitest';
import type { Node as FlowNode, Edge as FlowEdge } from 'reactflow';
import type { SourceRef } from '../relay-adapters/common/types';
import {
  computeLayout,
  classifyNodeColumn,
  nodeSizeForType,
} from '../graph/layout';

import {
  resolveTripWordBit,
  resolvePickupBit,
  isPickupBit,
  isTripWordBit,
  elementBase,
  isInstantaneous,
  isTimeOvercurrent,
  isDistance,
  isDifferential,
  PROTECTION_PREFIX_RE,
} from '../graph/protection';

import {
  buildReactFlowLayout,
  NODE_H_GAP,
  GATE_H_OFFSET,
} from '../graph/buildReactFlow';

import type { DependencyGraph, GraphNode } from '../selogic/graph';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DUMMY_SOURCE: SourceRef = { sourceFile: 'test', lineNumber: 0, rawText: '' };

function makeNode(
  id: string,
  deps: string[],
  expression: string | null,
  opts: Partial<GraphNode> = {},
): GraphNode {
  return {
    id,
    label: id,
    description: id,
    equation: expression != null
      ? {
          label: id,
          expression,
          description: id,
          source: DUMMY_SOURCE,
          functionType: 'GENERAL',
        }
      : undefined,
    isInput:  expression == null,
    isOutput: false,
    dependencies: deps,
    dependents:   [],
    depth: 0,
    ...opts,
  };
}

function makeGraph(nodes: GraphNode[]): DependencyGraph {
  const map = new Map<string, GraphNode>();
  for (const n of nodes) map.set(n.id, n);

  // Wire dependents
  for (const n of nodes) {
    for (const dep of n.dependencies) {
      const depNode = map.get(dep);
      if (depNode && !depNode.dependents.includes(n.id)) {
        depNode.dependents.push(n.id);
      }
    }
  }

  // Assign depth (BFS from inputs)
  const visited = new Set<string>();
  const queue: string[] = [];
  for (const [, n] of map) {
    if (n.isInput || n.dependencies.length === 0) {
      n.depth = 0;
      queue.push(n.id);
      visited.add(n.id);
    }
  }
  while (queue.length > 0) {
    const id  = queue.shift()!;
    const cur = map.get(id)!;
    for (const depId of cur.dependents) {
      const dep = map.get(depId);
      if (!dep) continue;
      dep.depth = Math.max(dep.depth, cur.depth + 1);
      if (!visited.has(depId)) {
        visited.add(depId);
        queue.push(depId);
      }
    }
  }

  return {
    nodes: map,
    roots:  [...map.values()].filter(n => n.dependencies.length === 0).map(n => n.id),
    leaves: [...map.values()].filter(n => n.dependents.length === 0).map(n => n.id),
  };
}

// ─── protection.ts — naming utilities ────────────────────────────────────────

describe('PROTECTION_PREFIX_RE', () => {
  it('matches 50, 51, 21, 87, 67, 79, SEF, Zd', () => {
    expect(PROTECTION_PREFIX_RE.test('50P1P')).toBe(true);
    expect(PROTECTION_PREFIX_RE.test('51G1T')).toBe(true);
    expect(PROTECTION_PREFIX_RE.test('21P1P')).toBe(true);
    expect(PROTECTION_PREFIX_RE.test('87LT')).toBe(true);
    expect(PROTECTION_PREFIX_RE.test('67P1P')).toBe(true);
    expect(PROTECTION_PREFIX_RE.test('79P')).toBe(true);
    expect(PROTECTION_PREFIX_RE.test('SEFP')).toBe(true);
    expect(PROTECTION_PREFIX_RE.test('Z1P')).toBe(true);
  });

  it('does not match unrelated signals', () => {
    expect(PROTECTION_PREFIX_RE.test('TR')).toBe(false);
    expect(PROTECTION_PREFIX_RE.test('52A')).toBe(false);
    expect(PROTECTION_PREFIX_RE.test('IN101')).toBe(false);
    expect(PROTECTION_PREFIX_RE.test('SV1')).toBe(false);
    expect(PROTECTION_PREFIX_RE.test('TD1')).toBe(false);
  });
});

describe('resolveTripWordBit', () => {
  it('converts pickup P suffix to T suffix', () => {
    expect(resolveTripWordBit('50P1P')).toBe('50P1T');
    expect(resolveTripWordBit('51G1P')).toBe('51G1T');
    expect(resolveTripWordBit('21P1P')).toBe('21P1T');
    expect(resolveTripWordBit('67P1P')).toBe('67P1T');
    expect(resolveTripWordBit('87L1P')).toBe('87L1T');
    expect(resolveTripWordBit('87T1P')).toBe('87T1T');
    expect(resolveTripWordBit('79P')).toBe('79T');
  });

  it('returns unchanged if not ending in P', () => {
    expect(resolveTripWordBit('50P1T')).toBe('50P1T');
    expect(resolveTripWordBit('TR')).toBe('TR');
    expect(resolveTripWordBit('SV1')).toBe('SV1');
  });
});

describe('resolvePickupBit', () => {
  it('converts trip T suffix to P suffix', () => {
    expect(resolvePickupBit('50P1T')).toBe('50P1P');
    expect(resolvePickupBit('51G1T')).toBe('51G1P');
    expect(resolvePickupBit('79T')).toBe('79P');
  });

  it('returns unchanged if not ending in T', () => {
    expect(resolvePickupBit('50P1P')).toBe('50P1P');
    expect(resolvePickupBit('TR')).toBe('TR');
    expect(resolvePickupBit('SV1')).toBe('SV1');
  });
});

describe('isPickupBit', () => {
  it('returns true for protection bits ending in P', () => {
    expect(isPickupBit('50P1P')).toBe(true);
    expect(isPickupBit('51G1P')).toBe(true);
    expect(isPickupBit('79P')).toBe(true);
    expect(isPickupBit('SEFP')).toBe(true);
    expect(isPickupBit('87LP')).toBe(true);
  });

  it('returns false for trip word bits', () => {
    expect(isPickupBit('50P1T')).toBe(false);
    expect(isPickupBit('51G1T')).toBe(false);
  });

  it('returns false for non-protection signals ending in P', () => {
    expect(isPickupBit('TR')).toBe(false);
    expect(isPickupBit('TRIP')).toBe(false);
    expect(isPickupBit('SVP')).toBe(false);   // no protection prefix
  });
});

describe('isTripWordBit', () => {
  it('returns true for protection bits ending in T', () => {
    expect(isTripWordBit('50P1T')).toBe(true);
    expect(isTripWordBit('51G1T')).toBe(true);
    expect(isTripWordBit('87LT')).toBe(true);
    expect(isTripWordBit('79T')).toBe(true);
  });

  it('returns false for pickup bits', () => {
    expect(isTripWordBit('51P1P')).toBe(false);
    expect(isTripWordBit('50P1P')).toBe(false);
  });

  it('returns false for unrelated signals ending in T', () => {
    expect(isTripWordBit('TR')).toBe(false);
    expect(isTripWordBit('TD1')).toBe(false);
    expect(isTripWordBit('TRIP')).toBe(false);
  });

  it('returns false for 87x element names (subtype T or L, 3 chars total)', () => {
    // '87T' = transformer differential element — NOT a trip word bit
    expect(isTripWordBit('87T')).toBe(false);
    // '87L' ends in L, not T — already excluded by endsWith check
    expect(isTripWordBit('87L')).toBe(false);
    // '87LT' and '87TT' ARE trip word bits (4 chars)
    expect(isTripWordBit('87LT')).toBe(true);
    expect(isTripWordBit('87TT')).toBe(true);
  });
});

describe('elementBase', () => {
  it('strips trailing P or T from protection elements', () => {
    expect(elementBase('50P1P')).toBe('50P1');
    expect(elementBase('50P1T')).toBe('50P1');
    expect(elementBase('51G1P')).toBe('51G1');
    expect(elementBase('79P')).toBe('79');
    expect(elementBase('79T')).toBe('79');
  });

  it('returns id unchanged for non-protection signals', () => {
    expect(elementBase('TR')).toBe('TR');
    expect(elementBase('SV1')).toBe('SV1');
    expect(elementBase('TD1')).toBe('TD1');
  });
});

describe('isInstantaneous / isTimeOvercurrent / isDistance / isDifferential', () => {
  it('isInstantaneous matches 50x elements', () => {
    expect(isInstantaneous('50P1P')).toBe(true);
    expect(isInstantaneous('50G1T')).toBe(true);
    expect(isInstantaneous('51P1P')).toBe(false);
  });

  it('isTimeOvercurrent matches 51x and 67x elements', () => {
    expect(isTimeOvercurrent('51P1P')).toBe(true);
    expect(isTimeOvercurrent('67G1T')).toBe(true);
    expect(isTimeOvercurrent('50P1P')).toBe(false);
  });

  it('isDistance matches 21x elements', () => {
    expect(isDistance('21P1P')).toBe(true);
    expect(isDistance('21P2T')).toBe(true);
    expect(isDistance('50P1P')).toBe(false);
  });

  it('isDifferential matches 87x elements', () => {
    expect(isDifferential('87LP')).toBe(true);
    expect(isDifferential('87T1T')).toBe(true);
    expect(isDifferential('51G1P')).toBe(false);
  });
});

// ─── buildReactFlow.ts — layout builder ──────────────────────────────────────

describe('buildReactFlowLayout — signal nodes', () => {
  it('creates one node per DependencyGraph node', () => {
    const inA  = makeNode('A', [], null, { depth: 0 });
    const inB  = makeNode('B', [], null, { depth: 0 });
    const out  = makeNode('OUT', ['A', 'B'], 'A + B', { isInput: false, depth: 1 });
    const graph = makeGraph([inA, inB, out]);

    const { nodes } = buildReactFlowLayout(graph, null, {}, () => {});
    const signalIds = nodes.filter(n => !n.id.startsWith('g_')).map(n => n.id);
    expect(signalIds).toContain('A');
    expect(signalIds).toContain('B');
    expect(signalIds).toContain('OUT');
  });

  it('assigns column-based x positions (input at col 0, computed at col 4)', () => {
    const inA  = makeNode('A', [], null, { depth: 0 });
    const out  = makeNode('OUT', ['A'], 'A', { isInput: false, depth: 1 });
    const graph = makeGraph([inA, out]);

    const { nodes } = buildReactFlowLayout(graph, null, {}, () => {});
    const nodeA   = nodes.find(n => n.id === 'A')!;
    const nodeOut = nodes.find(n => n.id === 'OUT')!;
    // col 0 (inputSignalNode / unclassified) → x = 40
    expect(nodeA.position.x).toBe(40);
    // col 4 (logicGateNode default for computed nodes) → x = 940
    expect(nodeOut.position.x).toBe(940);
  });
});

describe('buildReactFlowLayout — gate node insertion (AND)', () => {
  it('inserts an AND gate for A * B expression', () => {
    const inA  = makeNode('A', [], null, { depth: 0 });
    const inB  = makeNode('B', [], null, { depth: 0 });
    const out  = makeNode('OUT', ['A', 'B'], 'A * B', { isInput: false, depth: 1 });
    const graph = makeGraph([inA, inB, out]);

    const { nodes } = buildReactFlowLayout(graph, null, {}, () => {});
    const gateNodes = nodes.filter(n => n.id.startsWith('g_'));
    expect(gateNodes.length).toBeGreaterThanOrEqual(1);

    const andGate = gateNodes.find(n => n.type === 'andGate');
    expect(andGate).toBeDefined();
    expect(andGate!.data.gateType).toBe('and');
    expect(andGate!.data.inputCount).toBe(2);
  });

  it('places AND gate in logic gate column (col 4, x=940)', () => {
    const inA  = makeNode('A', [], null, { depth: 0 });
    const inB  = makeNode('B', [], null, { depth: 0 });
    const out  = makeNode('OUT', ['A', 'B'], 'A * B', { isInput: false, depth: 1 });
    const graph = makeGraph([inA, inB, out]);

    const { nodes } = buildReactFlowLayout(graph, null, {}, () => {});
    const andGate = nodes.find(n => n.type === 'andGate')!;

    // In the column-based layout all logic gate nodes go to col 4 (x = 940)
    expect(andGate.position.x).toBe(940);
  });
});

describe('buildReactFlowLayout — gate node insertion (OR)', () => {
  it('inserts an OR gate for A + B expression', () => {
    const inA  = makeNode('A', [], null, { depth: 0 });
    const inB  = makeNode('B', [], null, { depth: 0 });
    const out  = makeNode('OUT', ['A', 'B'], 'A + B', { isInput: false, depth: 1 });
    const graph = makeGraph([inA, inB, out]);

    const { nodes } = buildReactFlowLayout(graph, null, {}, () => {});
    const orGate = nodes.find(n => n.type === 'orGate');
    expect(orGate).toBeDefined();
    expect(orGate!.data.gateType).toBe('or');
    expect(orGate!.data.inputCount).toBe(2);
  });
});

describe('buildReactFlowLayout — gate node insertion (NOT)', () => {
  it('inserts a NOT gate for !A expression', () => {
    const inA  = makeNode('A', [], null, { depth: 0 });
    const out  = makeNode('OUT', ['A'], '!A', { isInput: false, depth: 1 });
    const graph = makeGraph([inA, out]);

    const { nodes } = buildReactFlowLayout(graph, null, {}, () => {});
    const notGate = nodes.find(n => n.type === 'notGate');
    expect(notGate).toBeDefined();
    expect(notGate!.data.gateType).toBe('not');
    expect(notGate!.data.inputCount).toBe(1);
  });
});

describe('buildReactFlowLayout — gate node insertion (EDGE)', () => {
  it('inserts an EDGE gate for ^A expression', () => {
    const inA  = makeNode('A', [], null, { depth: 0 });
    const out  = makeNode('OUT', ['A'], '^A', { isInput: false, depth: 1 });
    const graph = makeGraph([inA, out]);

    const { nodes } = buildReactFlowLayout(graph, null, {}, () => {});
    const edgeGate = nodes.find(n => n.type === 'edgeGate');
    expect(edgeGate).toBeDefined();
    expect(edgeGate!.data.gateType).toBe('edge');
    expect(edgeGate!.data.inputCount).toBe(1);
  });
});

describe('buildReactFlowLayout — gate edges', () => {
  it('wires signal nodes to gate node and gate node to target', () => {
    const inA  = makeNode('A', [], null, { depth: 0 });
    const inB  = makeNode('B', [], null, { depth: 0 });
    const out  = makeNode('OUT', ['A', 'B'], 'A * B', { isInput: false, depth: 1 });
    const graph = makeGraph([inA, inB, out]);

    const { nodes, edges } = buildReactFlowLayout(graph, null, {}, () => {});
    const andGate  = nodes.find(n => n.type === 'andGate')!;
    const gateId   = andGate.id;

    // There should be edges A→gate and B→gate
    const edgeToGate = edges.filter(e => e.target === gateId);
    expect(edgeToGate.length).toBeGreaterThanOrEqual(2);
    const sources = edgeToGate.map(e => e.source);
    expect(sources).toContain('A');
    expect(sources).toContain('B');

    // There should be an edge gate→OUT
    const edgeFromGate = edges.find(e => e.source === gateId && e.target === 'OUT');
    expect(edgeFromGate).toBeDefined();
  });
});

describe('buildReactFlowLayout — compound expression (A + B) * !C', () => {
  it('inserts OR, NOT, and AND gates for a three-input compound expression', () => {
    const inA  = makeNode('A', [], null, { depth: 0 });
    const inB  = makeNode('B', [], null, { depth: 0 });
    const inC  = makeNode('C', [], null, { depth: 0 });
    // (A + B) * !C
    const out  = makeNode('OUT', ['A', 'B', 'C'], '(A + B) * !C', { isInput: false, depth: 1 });
    const graph = makeGraph([inA, inB, inC, out]);

    const { nodes } = buildReactFlowLayout(graph, null, {}, () => {});
    const gateNodes = nodes.filter(n => n.id.startsWith('g_'));

    const types = gateNodes.map(n => n.type);
    expect(types).toContain('andGate');
    expect(types).toContain('orGate');
    expect(types).toContain('notGate');
  });
});

describe('buildReactFlowLayout — simple single-operand equation (no gate)', () => {
  it('uses direct edge (no gate) for a plain operand equation', () => {
    const inA  = makeNode('A', [], null, { depth: 0 });
    // Single operand — parseExpression returns OperandNode
    const out  = makeNode('OUT', ['A'], 'A', { isInput: false, depth: 1 });
    const graph = makeGraph([inA, out]);

    const { nodes, edges } = buildReactFlowLayout(graph, null, {}, () => {});
    const gateNodes = nodes.filter(n => n.id.startsWith('g_'));
    // Simple operand: no gate nodes expected
    expect(gateNodes.length).toBe(0);

    // Direct edge A→OUT expected
    const directEdge = edges.find(e => e.source === 'A' && e.target === 'OUT');
    expect(directEdge).toBeDefined();
  });
});

describe('buildReactFlowLayout — trip word bit nodes', () => {
  it('trip word bit protection nodes (ending T) are NOT toggleable', () => {
    const twb  = makeNode('51G1T', [], null, {
      isInput: false,
      depth: 0,
      equation: { label: '51G1T', expression: '51G1P', description: 'TOC trip bit', source: DUMMY_SOURCE, functionType: 'GENERAL' as const },
    });
    const pkp  = makeNode('51G1P', [], null, { isInput: true, depth: 0 });
    const graph = makeGraph([pkp, twb]);

    const { nodes } = buildReactFlowLayout(graph, null, {}, () => {});
    const twbNode = nodes.find(n => n.id === '51G1T');
    expect(twbNode).toBeDefined();
    // The NodeDisplayInfo.toggleable should be false for trip word bits
    expect((twbNode!.data as { displayInfo: { toggleable: boolean } }).displayInfo.toggleable).toBe(false);
    expect((twbNode!.data as { displayInfo: { isTripWordBit?: boolean } }).displayInfo.isTripWordBit).toBe(true);
  });
});

describe('buildReactFlowLayout — no relay → settings show defaults', () => {
  it('builds layout without throwing when relay is null', () => {
    const inA  = makeNode('A', [], null, { depth: 0 });
    const out  = makeNode('OUT', ['A'], 'A + A', { isInput: false, depth: 1 });
    const graph = makeGraph([inA, out]);

    expect(() => buildReactFlowLayout(graph, null, {}, () => {})).not.toThrow();
  });
});

// ─── computeLayout — connection-aware vertical ordering ───────────────────────

/** Minimal FlowNode factory for layout tests. */
function fNode(id: string, type: string): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, data: {} } as FlowNode;
}

/** Minimal FlowEdge factory for layout tests. */
function fEdge(source: string, target: string): FlowEdge {
  return { id: `e-${source}-${target}`, source, target } as FlowEdge;
}

describe('computeLayout — SEL-351 chain alignment', () => {
  // TR := 51P1T * !50BF * 52A
  // Protection chain: 51P1P → 51P1TC → 51P1T → g_and → TR
  // Inputs: 52A → g_and, 50BF → g_not → g_and

  const nodes: FlowNode[] = [
    fNode('52A',    'inputSignalNode'),
    fNode('50BF',   'inputSignalNode'),
    fNode('51P1P',  'protectionElement'),
    fNode('51P1TC', 'timerNode'),
    fNode('51P1T',  'protectionElement'),
    fNode('g_not',  'notGate'),
    fNode('g_and',  'andGate'),
    fNode('TR',     'tripOutputNode'),
  ];

  const edges: FlowEdge[] = [
    fEdge('52A',    'g_and'),
    fEdge('50BF',   'g_not'),
    fEdge('51P1P',  '51P1TC'),
    fEdge('51P1TC', '51P1T'),
    fEdge('51P1T',  'g_and'),
    fEdge('g_not',  'g_and'),
    fEdge('g_and',  'TR'),
  ];

  const result = computeLayout(nodes, edges);
  const pos = (id: string) => result.find(p => p.id === id)!.position;

  it('places TR at y = 0 (anchor)', () => {
    expect(pos('TR').y).toBe(0);
  });

  it('places 51P1T at the same y as TR (direct chain through gate)', () => {
    // 51P1T → g_and → TR(y=0); barycenter resolves to y=0
    expect(Math.abs(pos('51P1T').y)).toBeLessThan(5);
  });

  it('places 51P1TC at the same y as 51P1T (horizontal chain)', () => {
    expect(Math.abs(pos('51P1TC').y - pos('51P1T').y)).toBeLessThan(5);
  });

  it('places 51P1P at the same y as 51P1TC (horizontal chain)', () => {
    expect(Math.abs(pos('51P1P').y - pos('51P1TC').y)).toBeLessThan(5);
  });

  it('assigns correct column x positions', () => {
    expect(pos('TR').x).toBe(1060);     // col 5
    expect(pos('51P1T').x).toBe(700);   // col 3
    expect(pos('51P1TC').x).toBe(480);  // col 2
    expect(pos('51P1P').x).toBe(240);   // col 1
    expect(pos('52A').x).toBe(40);      // col 0
    expect(pos('g_and').x).toBe(940);   // col 4
  });
});

describe('computeLayout — SEL-421 POTT no-overlap guarantee', () => {
  // POTT scheme: two trip paths (21P and 51P), both gated with RxWI and 52A
  const nodes: FlowNode[] = [
    fNode('RxWI',   'inputSignalNode'),
    fNode('52A',    'inputSignalNode'),
    fNode('21P1P',  'protectionElement'),
    fNode('51P1P',  'protectionElement'),
    fNode('21P1T',  'protectionElement'),
    fNode('51P1T',  'protectionElement'),
    fNode('g_and1', 'andGate'),
    fNode('g_and2', 'andGate'),
    fNode('g_or',   'orGate'),
    fNode('TR',     'tripOutputNode'),
  ];

  const edges: FlowEdge[] = [
    fEdge('21P1P',  '21P1T'),
    fEdge('51P1P',  '51P1T'),
    fEdge('21P1T',  'g_and1'),
    fEdge('RxWI',   'g_and1'),
    fEdge('52A',    'g_and1'),
    fEdge('52A',    'g_and2'),
    fEdge('51P1T',  'g_and2'),
    fEdge('g_and1', 'g_or'),
    fEdge('g_and2', 'g_or'),
    fEdge('g_or',   'TR'),
  ];

  it('no two nodes in the same column have overlapping bounding boxes (20 px padding)', () => {
    const result = computeLayout(nodes, edges);
    const posMap = new Map(result.map(p => [p.id, p.position]));

    // Group node IDs by column
    const cols = new Map<number, string[]>();
    for (const node of nodes) {
      const col = classifyNodeColumn(node.id, node.type);
      if (!cols.has(col)) cols.set(col, []);
      cols.get(col)!.push(node.id);
    }

    // For each column, check every pair for vertical overlap
    for (const [, colIds] of cols) {
      if (colIds.length <= 1) continue;
      for (let i = 0; i < colIds.length; i++) {
        for (let j = i + 1; j < colIds.length; j++) {
          const aId   = colIds[i];
          const bId   = colIds[j];
          const aPos  = posMap.get(aId)!;
          const bPos  = posMap.get(bId)!;
          const aNode = nodes.find(n => n.id === aId)!;
          const bNode = nodes.find(n => n.id === bId)!;
          const aSize = nodeSizeForType(aNode.type ?? 'default');
          const bSize = nodeSizeForType(bNode.type ?? 'default');

          const aBottom = aPos.y + aSize.height / 2 + 20;
          const bBottom = bPos.y + bSize.height / 2 + 20;
          const aTop    = aPos.y - aSize.height / 2;
          const bTop    = bPos.y - bSize.height / 2;

          const overlap = aBottom > bTop && bBottom > aTop;
          if (overlap) {
            throw new Error(
              `Overlap in col ${classifyNodeColumn(aId, aNode.type)}: ` +
              `${aId}(y=${aPos.y.toFixed(1)}) overlaps ${bId}(y=${bPos.y.toFixed(1)})`
            );
          }
        }
      }
    }
  });

  it('places TR at y = 0', () => {
    const result  = computeLayout(nodes, edges);
    const trPos   = result.find(p => p.id === 'TR')!;
    expect(trPos.position.y).toBe(0);
  });
});

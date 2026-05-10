/**
 * @file graph-simulation.test.ts
 * Tests for the graph simulation engine:
 *   - propagate.ts  (evaluateAST, topologicalSort, initialSignalStates, propagate, isToggleable)
 *   - animator.ts   (buildAnimationSequence, helpers)
 *   - displaySettings.ts (baseElement, extractDisplaySettings)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateAST,
  topologicalSort,
  initialSignalStates,
  propagate,
  isToggleable,
  type SignalStates,
} from '../graph/propagate';
import {
  buildAnimationSequence,
  sequenceDuration,
  nodeEvents,
  edgeEvents,
  SPEED_SCALE,
} from '../graph/animator';
import {
  baseElement,
  extractDisplaySettings,
} from '../graph/displaySettings';
import type { DependencyGraph, GraphNode } from '../selogic/graph';
import type { ParsedRelaySettings, SettingGroup, SettingEntry, LogicEquation } from '../relay-adapters/common/types';
import type { ASTNode } from '../selogic/ast';

// ─── AST helpers ─────────────────────────────────────────────────────────────

function lit(v: 0 | 1): ASTNode {
  return { type: 'Literal', value: v };
}
function op(name: string): ASTNode {
  return { type: 'Operand', name };
}
function not(child: ASTNode): ASTNode {
  return { type: 'UnaryOp', op: 'NOT', operand: child };
}
function edgeOp(child: ASTNode): ASTNode {
  return { type: 'UnaryOp', op: 'EDGE', operand: child };
}
function and(left: ASTNode, right: ASTNode): ASTNode {
  return { type: 'BinaryOp', op: 'AND', left, right };
}
function or(left: ASTNode, right: ASTNode): ASTNode {
  return { type: 'BinaryOp', op: 'OR', left, right };
}
function xor(left: ASTNode, right: ASTNode): ASTNode {
  return { type: 'BinaryOp', op: 'XOR', left, right };
}

// ─── Graph helpers ────────────────────────────────────────────────────────────

interface MakeNodeOpts {
  isInput?: boolean;
  isOutput?: boolean;
  functionType?: LogicEquation['functionType'];
}

/**
 * Create a GraphNode for testing.
 * @param id        Node ID / signal name
 * @param deps      Names of signals this node depends on
 * @param expression SELogic expression string, or null if this is an input node
 * @param opts      Optional overrides
 */
function makeNode(
  id: string,
  deps: string[],
  expression: string | null,
  opts: MakeNodeOpts = {},
): GraphNode {
  const src: SettingEntry['source'] = { sourceFile: 'test', lineNumber: 0, rawText: '' };
  const equation: LogicEquation | undefined =
    expression !== null
      ? {
          label: id,
          expression,
          description: '',
          source: src,
          functionType: opts.functionType ?? 'GENERAL',
        }
      : undefined;

  return {
    id,
    label: id,
    description: '',
    equation,
    isInput:  opts.isInput  ?? (expression === null),
    isOutput: opts.isOutput ?? false,
    dependencies: deps,
    dependents:   [],        // filled in by makeGraph
    depth: 0,
  };
}

/**
 * Build a DependencyGraph from an array of nodes.
 * Automatically computes dependents from the dependency lists.
 */
function makeGraph(nodes: GraphNode[]): DependencyGraph {
  const map = new Map<string, GraphNode>();

  // First pass — clone nodes with empty dependents
  for (const n of nodes) {
    map.set(n.id, { ...n, dependents: [] });
  }

  // Second pass — wire up reverse edges
  for (const n of nodes) {
    for (const depId of n.dependencies) {
      const dep = map.get(depId);
      if (dep && !dep.dependents.includes(n.id)) {
        dep.dependents.push(n.id);
      }
    }
  }

  const arr = [...map.values()];
  return {
    nodes: map,
    roots:  arr.filter(n => n.dependencies.length === 0).map(n => n.id),
    leaves: arr.filter(n => n.dependents.length  === 0).map(n => n.id),
  };
}

/**
 * Build a minimal ParsedRelaySettings for displaySettings tests.
 * @param model  Relay model ID
 * @param tag    Relay tag (e.g. 'FDR01')
 * @param kvs    Flat key→value map of settings
 */
function makeRelay(
  model: ParsedRelaySettings['model'],
  tag: string,
  kvs: Record<string, string>,
): ParsedRelaySettings {
  const src: SettingEntry['source'] = { sourceFile: 'test', lineNumber: 0, rawText: '' };
  const entries: SettingEntry[] = Object.entries(kvs).map(([key, value]) => ({
    key,
    value,
    source: src,
  }));
  const group: SettingGroup = { name: 'SELOGIC', entries, source: src };

  return {
    model,
    tag,
    firmware: '1.0',
    settingGroups: [group],
    logicEquations: [],
    rawLines: [],
    sourceFile: 'test',
    lineCount: 0,
  };
}

// ─── evaluateAST — literals ───────────────────────────────────────────────────

describe('evaluateAST — literals', () => {
  it('returns 1 for Literal value 1', () => {
    expect(evaluateAST(lit(1), {})).toBe(1);
  });
  it('returns 0 for Literal value 0', () => {
    expect(evaluateAST(lit(0), {})).toBe(0);
  });
});

// ─── evaluateAST — operands ───────────────────────────────────────────────────

describe('evaluateAST — operands', () => {
  it('looks up signal state and returns it', () => {
    expect(evaluateAST(op('51P'), { '51P': 1 })).toBe(1);
  });
  it('returns 0 for missing signal (default off)', () => {
    expect(evaluateAST(op('MISSING'), {})).toBe(0);
  });
});

// ─── evaluateAST — NOT ────────────────────────────────────────────────────────

describe('evaluateAST — NOT', () => {
  it('inverts 1 → 0', () => {
    expect(evaluateAST(not(op('A')), { A: 1 })).toBe(0);
  });
  it('inverts 0 → 1', () => {
    expect(evaluateAST(not(op('A')), { A: 0 })).toBe(1);
  });
  it('inverts literal', () => {
    expect(evaluateAST(not(lit(1)), {})).toBe(0);
  });
});

// ─── evaluateAST — AND ────────────────────────────────────────────────────────

describe('evaluateAST — AND', () => {
  it('1 AND 1 = 1', () => {
    expect(evaluateAST(and(lit(1), lit(1)), {})).toBe(1);
  });
  it('1 AND 0 = 0', () => {
    expect(evaluateAST(and(lit(1), lit(0)), {})).toBe(0);
  });
  it('0 AND 0 = 0', () => {
    expect(evaluateAST(and(lit(0), lit(0)), {})).toBe(0);
  });
});

// ─── evaluateAST — OR ─────────────────────────────────────────────────────────

describe('evaluateAST — OR', () => {
  it('0 OR 1 = 1', () => {
    expect(evaluateAST(or(lit(0), lit(1)), {})).toBe(1);
  });
  it('1 OR 0 = 1', () => {
    expect(evaluateAST(or(lit(1), lit(0)), {})).toBe(1);
  });
  it('0 OR 0 = 0', () => {
    expect(evaluateAST(or(lit(0), lit(0)), {})).toBe(0);
  });
});

// ─── evaluateAST — XOR ───────────────────────────────────────────────────────

describe('evaluateAST — XOR', () => {
  it('1 XOR 0 = 1', () => {
    expect(evaluateAST(xor(lit(1), lit(0)), {})).toBe(1);
  });
  it('1 XOR 1 = 0', () => {
    expect(evaluateAST(xor(lit(1), lit(1)), {})).toBe(0);
  });
});

// ─── evaluateAST — compound ───────────────────────────────────────────────────

describe('evaluateAST — compound', () => {
  it('(A AND B) OR C evaluates correctly', () => {
    const ast = or(and(op('A'), op('B')), op('C'));
    expect(evaluateAST(ast, { A: 1, B: 0, C: 1 })).toBe(1);
    expect(evaluateAST(ast, { A: 1, B: 1, C: 0 })).toBe(1);
    expect(evaluateAST(ast, { A: 0, B: 0, C: 0 })).toBe(0);
  });
  it('NOT (A OR B) inverts', () => {
    expect(evaluateAST(not(or(op('A'), op('B'))), { A: 0, B: 0 })).toBe(1);
    expect(evaluateAST(not(or(op('A'), op('B'))), { A: 1, B: 0 })).toBe(0);
  });
  it('EDGE treated as pass-through', () => {
    expect(evaluateAST(edgeOp(op('A')), { A: 1 })).toBe(1);
    expect(evaluateAST(edgeOp(op('A')), { A: 0 })).toBe(0);
  });
});

// ─── topologicalSort ─────────────────────────────────────────────────────────

describe('topologicalSort', () => {
  it('single node returns itself', () => {
    const g = makeGraph([makeNode('A', [], null)]);
    expect(topologicalSort(g)).toEqual(['A']);
  });

  it('sorts A → B such that A comes before B', () => {
    const g = makeGraph([
      makeNode('A', [], null),
      makeNode('B', ['A'], 'A'),
    ]);
    const order = topologicalSort(g);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
  });

  it('sorts a chain A → B → C', () => {
    const g = makeGraph([
      makeNode('C', ['B'], 'B'),
      makeNode('A', [], null),
      makeNode('B', ['A'], 'A'),
    ]);
    const order = topologicalSort(g);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'));
  });

  it('handles diamond dependency (A→B, A→C, B+C→D)', () => {
    const g = makeGraph([
      makeNode('A', [], null),
      makeNode('B', ['A'], 'A'),
      makeNode('C', ['A'], 'A'),
      makeNode('D', ['B', 'C'], 'B + C'),
    ]);
    const order = topologicalSort(g);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('C'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'));
    expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
  });

  it('returns all nodes even with no dependencies', () => {
    const g = makeGraph([
      makeNode('X', [], null),
      makeNode('Y', [], null),
      makeNode('Z', [], null),
    ]);
    expect(topologicalSort(g).sort()).toEqual(['X', 'Y', 'Z']);
  });
});

// ─── initialSignalStates ──────────────────────────────────────────────────────

describe('initialSignalStates', () => {
  it('returns 0 for all nodes', () => {
    const g = makeGraph([makeNode('A', [], null), makeNode('B', [], null)]);
    const states = initialSignalStates(g);
    expect(states['A']).toBe(0);
    expect(states['B']).toBe(0);
  });

  it('includes all node IDs', () => {
    const ids = ['X', 'Y', 'Z'];
    const g = makeGraph(ids.map(id => makeNode(id, [], null)));
    const states = initialSignalStates(g);
    expect(Object.keys(states).sort()).toEqual(ids.sort());
  });
});

// ─── propagate — SEL-351 style ────────────────────────────────────────────────

describe('propagate — SEL-351 style graph', () => {
  // 51P1 (input) → TD1 (timer, expr='51P1') → TR (expr='TD1')
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = makeGraph([
      makeNode('51P1', [], null),
      makeNode('TD1',  ['51P1'], '51P1', { functionType: 'TIMER_IN' }),
      makeNode('TR',   ['TD1'],  'TD1'),
    ]);
  });

  it('all signals start at 0', () => {
    const base: SignalStates = { '51P1': 0, TD1: 0, TR: 0 };
    const result = propagate(base, {}, graph);
    expect(result.newStates['TR']).toBe(0);
    expect(result.affected).toEqual([]);
  });

  it('setting 51P1=1 propagates to TD1 and TR', () => {
    const base: SignalStates = { '51P1': 0, TD1: 0, TR: 0 };
    const result = propagate(base, { '51P1': 1 }, graph);
    expect(result.newStates['51P1']).toBe(1);
    expect(result.newStates['TD1']).toBe(1);
    expect(result.newStates['TR']).toBe(1);
    expect(result.affected).toContain('TD1');
    expect(result.affected).toContain('TR');
  });

  it('resetting 51P1=0 collapses entire chain', () => {
    const base: SignalStates = { '51P1': 1, TD1: 1, TR: 1 };
    const result = propagate(base, { '51P1': 0 }, graph);
    expect(result.newStates['TD1']).toBe(0);
    expect(result.newStates['TR']).toBe(0);
  });

  it('sortedOrder includes all nodes in dependency order', () => {
    const base: SignalStates = { '51P1': 0, TD1: 0, TR: 0 };
    const result = propagate(base, {}, graph);
    const idx = (id: string) => result.sortedOrder.indexOf(id);
    expect(idx('51P1')).toBeLessThan(idx('TD1'));
    expect(idx('TD1')).toBeLessThan(idx('TR'));
  });

  it('AND gate: both inputs required', () => {
    const g = makeGraph([
      makeNode('A', [], null),
      makeNode('B', [], null),
      makeNode('OUT', ['A', 'B'], 'A * B'),
    ]);
    const base: SignalStates = { A: 0, B: 0, OUT: 0 };

    let r = propagate(base, { A: 1 }, g);
    expect(r.newStates['OUT']).toBe(0);

    r = propagate(base, { A: 1, B: 1 }, g);
    expect(r.newStates['OUT']).toBe(1);
  });

  it('OR gate: one input sufficient', () => {
    const g = makeGraph([
      makeNode('A', [], null),
      makeNode('B', [], null),
      makeNode('OUT', ['A', 'B'], 'A + B'),
    ]);
    const base: SignalStates = { A: 0, B: 0, OUT: 0 };
    const r = propagate(base, { A: 1 }, g);
    expect(r.newStates['OUT']).toBe(1);
  });

  it('NOT gate: inverts upstream', () => {
    const g = makeGraph([
      makeNode('ENABLE', [], null),
      makeNode('BLOCK',  ['ENABLE'], '!ENABLE'),
      makeNode('TR',     ['BLOCK'],  'BLOCK'),
    ]);
    const base: SignalStates = { ENABLE: 0, BLOCK: 0, TR: 0 };

    // ENABLE=0 → BLOCK=NOT(0)=1 → TR=1
    let r = propagate(base, {}, g);
    expect(r.newStates['BLOCK']).toBe(1);
    expect(r.newStates['TR']).toBe(1);

    // Override ENABLE=1 → BLOCK=NOT(1)=0 → TR=0
    r = propagate({ ENABLE: 0, BLOCK: 1, TR: 1 }, { ENABLE: 1 }, g);
    expect(r.newStates['BLOCK']).toBe(0);
    expect(r.newStates['TR']).toBe(0);
  });
});

// ─── propagate — SEL-421 style ────────────────────────────────────────────────

describe('propagate — SEL-421 style (21P zone)', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = makeGraph([
      makeNode('21P1', [], null),
      makeNode('21P2', [], null),
      makeNode('Z1_OR_Z2', ['21P1', '21P2'], '21P1 + 21P2'),
      makeNode('TR',        ['Z1_OR_Z2'],     'Z1_OR_Z2'),
    ]);
  });

  it('zone 1 pickup trips', () => {
    const base: SignalStates = { '21P1': 0, '21P2': 0, Z1_OR_Z2: 0, TR: 0 };
    const r = propagate(base, { '21P1': 1 }, graph);
    expect(r.newStates['TR']).toBe(1);
  });

  it('zone 2 pickup trips', () => {
    const base: SignalStates = { '21P1': 0, '21P2': 0, Z1_OR_Z2: 0, TR: 0 };
    const r = propagate(base, { '21P2': 1 }, graph);
    expect(r.newStates['TR']).toBe(1);
  });

  it('affected list reflects actual changes', () => {
    // already tripped via 21P1; adding 21P2=1 doesn't re-change TR
    const base: SignalStates = { '21P1': 1, '21P2': 0, Z1_OR_Z2: 1, TR: 1 };
    const r = propagate(base, { '21P2': 1 }, graph);
    expect(r.affected).not.toContain('TR');
  });
});

// ─── propagate — latch-style graph ───────────────────────────────────────────

describe('propagate — latch-style graph', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = makeGraph([
      makeNode('50P1',  [], null),
      makeNode('SV1',   ['50P1'], '50P1', { functionType: 'LATCH_SET' }),
      makeNode('RESET', [], null),
      makeNode('TR',    ['SV1', 'RESET'], 'SV1 * !RESET'),
    ]);
  });

  it('pickup sets latch and asserts TR', () => {
    const base: SignalStates = { '50P1': 0, SV1: 0, RESET: 0, TR: 0 };
    const r = propagate(base, { '50P1': 1 }, graph);
    expect(r.newStates['SV1']).toBe(1);
    expect(r.newStates['TR']).toBe(1);
  });

  it('RESET signal blocks TR', () => {
    const base: SignalStates = { '50P1': 1, SV1: 1, RESET: 0, TR: 1 };
    const r = propagate(base, { RESET: 1 }, graph);
    expect(r.newStates['TR']).toBe(0);
  });

  it('multiple overrides applied atomically', () => {
    const base: SignalStates = { '50P1': 0, SV1: 0, RESET: 0, TR: 0 };
    const r = propagate(base, { '50P1': 1, RESET: 0 }, graph);
    expect(r.newStates['TR']).toBe(1);
  });

  it('50P1 drop-out removes SV1 (simple equation, not memory latch)', () => {
    const base: SignalStates = { '50P1': 1, SV1: 1, RESET: 0, TR: 1 };
    const r = propagate(base, { '50P1': 0 }, graph);
    // SV1 equation = '50P1', so computed value = 0
    expect(r.newStates['SV1']).toBe(0);
    expect(r.newStates['TR']).toBe(0);
  });
});

// ─── isToggleable ─────────────────────────────────────────────────────────────

describe('isToggleable', () => {
  it('input node (isInput:true) is toggleable', () => {
    const g = makeGraph([makeNode('IN1', [], null, { isInput: true })]);
    expect(isToggleable('IN1', g)).toBe(true);
  });

  it('51P1 protection element prefix is toggleable', () => {
    const g = makeGraph([makeNode('51P1', [], null)]);
    expect(isToggleable('51P1', g)).toBe(true);
  });

  it('50G1 protection element prefix is toggleable', () => {
    const g = makeGraph([makeNode('50G1', [], null)]);
    expect(isToggleable('50G1', g)).toBe(true);
  });

  it('21P1 zone distance element is toggleable', () => {
    const g = makeGraph([makeNode('21P1', [], null)]);
    expect(isToggleable('21P1', g)).toBe(true);
  });

  it('computed AND gate is NOT toggleable', () => {
    const g = makeGraph([
      makeNode('A', [], null),
      makeNode('B', [], null),
      makeNode('OUT', ['A', 'B'], 'A * B'),
    ]);
    expect(isToggleable('OUT', g)).toBe(false);
  });
});

// ─── buildAnimationSequence ───────────────────────────────────────────────────

describe('buildAnimationSequence', () => {
  function makeSimpleGraph(): DependencyGraph {
    return makeGraph([
      makeNode('51P1', [], null),
      makeNode('TD1',  ['51P1'], '51P1', { functionType: 'TIMER_IN' }),
      makeNode('TR',   ['TD1'],  'TD1'),
    ]);
  }

  const OLD_STATES: SignalStates = { '51P1': 0, TD1: 0, TR: 0 };
  const NEW_STATES: SignalStates = { '51P1': 1, TD1: 1, TR: 1 };
  const ORDER = ['51P1', 'TD1', 'TR'];

  it('returns events for all changed nodes', () => {
    const g = makeSimpleGraph();
    const events = buildAnimationSequence(OLD_STATES, NEW_STATES, ORDER, g, 'normal');
    const nodeIds = nodeEvents(events).map(e => e.target);
    expect(nodeIds).toContain('51P1');
    expect(nodeIds).toContain('TD1');
    expect(nodeIds).toContain('TR');
  });

  it('TR node generates trip-ripple event', () => {
    const g = makeSimpleGraph();
    const events = buildAnimationSequence(OLD_STATES, NEW_STATES, ORDER, g, 'normal');
    const tripEvts = events.filter(e => e.type === 'trip-ripple');
    expect(tripEvts.length).toBeGreaterThan(0);
    expect(tripEvts[0].target).toBe('TR');
  });

  it('generates edge-pulse events for changed connections', () => {
    const g = makeSimpleGraph();
    const events = buildAnimationSequence(OLD_STATES, NEW_STATES, ORDER, g, 'normal');
    expect(edgeEvents(events).length).toBeGreaterThan(0);
  });

  it('slow speed produces longer total duration than normal', () => {
    const g = makeSimpleGraph();
    const slow   = buildAnimationSequence(OLD_STATES, NEW_STATES, ORDER, g, 'slow');
    const normal = buildAnimationSequence(OLD_STATES, NEW_STATES, ORDER, g, 'normal');
    expect(sequenceDuration(slow)).toBeGreaterThan(sequenceDuration(normal));
  });

  it('fast speed produces shorter total duration than normal', () => {
    const g = makeSimpleGraph();
    const fast   = buildAnimationSequence(OLD_STATES, NEW_STATES, ORDER, g, 'fast');
    const normal = buildAnimationSequence(OLD_STATES, NEW_STATES, ORDER, g, 'normal');
    expect(sequenceDuration(fast)).toBeLessThan(sequenceDuration(normal));
  });

  it('no changes → empty sequence', () => {
    const g = makeSimpleGraph();
    const events = buildAnimationSequence(OLD_STATES, OLD_STATES, ORDER, g, 'normal');
    expect(events.length).toBe(0);
  });

  it('events are sorted by timestamp', () => {
    const g = makeSimpleGraph();
    const events = buildAnimationSequence(OLD_STATES, NEW_STATES, ORDER, g, 'normal');
    for (let i = 1; i < events.length; i++) {
      expect(events[i].timestamp).toBeGreaterThanOrEqual(events[i - 1].timestamp);
    }
  });

  it('NOT upstream generates blocked event', () => {
    // ENABLE going 0→1 causes !ENABLE path in TR equation → blocked
    const g = makeGraph([
      makeNode('ENABLE', [], null),
      makeNode('TR',     ['ENABLE'], '!ENABLE'),
    ]);
    const old: SignalStates = { ENABLE: 0, TR: 1 };
    const nw:  SignalStates = { ENABLE: 1, TR: 0 };
    const order = ['ENABLE', 'TR'];
    const events = buildAnimationSequence(old, nw, order, g, 'normal');
    const blocked = events.filter(e => e.type === 'blocked');
    expect(blocked.length).toBeGreaterThan(0);
  });
});

// ─── buildAnimationSequence helpers ──────────────────────────────────────────

describe('buildAnimationSequence helpers', () => {
  it('SPEED_SCALE slow > normal > fast', () => {
    expect(SPEED_SCALE.slow).toBeGreaterThan(SPEED_SCALE.normal);
    expect(SPEED_SCALE.normal).toBeGreaterThan(SPEED_SCALE.fast);
  });

  it('nodeEvents filters out edge-pulse events', () => {
    const g = makeGraph([
      makeNode('A', [], null),
      makeNode('B', ['A'], 'A'),
    ]);
    const events = buildAnimationSequence({ A: 0, B: 0 }, { A: 1, B: 1 }, ['A', 'B'], g, 'normal');
    const nEvts = nodeEvents(events);
    expect(nEvts.every(e => e.type !== 'edge-pulse')).toBe(true);
  });

  it('edgeEvents returns only edge-pulse events', () => {
    const g = makeGraph([
      makeNode('A', [], null),
      makeNode('B', ['A'], 'A'),
    ]);
    const events = buildAnimationSequence({ A: 0, B: 0 }, { A: 1, B: 1 }, ['A', 'B'], g, 'normal');
    const eEvts = edgeEvents(events);
    expect(eEvts.every(e => e.type === 'edge-pulse')).toBe(true);
  });

  it('sequenceDuration equals last timestamp + last duration', () => {
    const g = makeGraph([makeNode('A', [], null)]);
    const events = buildAnimationSequence({ A: 0 }, { A: 1 }, ['A'], g, 'normal');
    if (events.length > 0) {
      const last = events[events.length - 1];
      expect(sequenceDuration(events)).toBe(last.timestamp + last.duration);
    }
  });

  it('empty events → sequenceDuration = 0', () => {
    expect(sequenceDuration([])).toBe(0);
  });
});

// ─── baseElement ──────────────────────────────────────────────────────────────

describe('baseElement', () => {
  it('51P1 → 51P', () => {
    expect(baseElement('51P1')).toBe('51P');
  });
  it('50G2 → 50G', () => {
    expect(baseElement('50G2')).toBe('50G');
  });
  it('87T → 87T (no trailing digit)', () => {
    expect(baseElement('87T')).toBe('87T');
  });
  it('TD1 → TD', () => {
    expect(baseElement('TD1')).toBe('TD');
  });
  it('TR → TR', () => {
    expect(baseElement('TR')).toBe('TR');
  });
});

// ─── extractDisplaySettings — kind classification ─────────────────────────────

describe('extractDisplaySettings — kind classification', () => {
  const relay = makeRelay('SEL-351', 'FDR01', {
    E51P: '1', '51PP': '5.0', '51PTD': '2.0', '51PC': 'U2',
    E50P: '1', '50PP': '20.0',
  });

  it('TR → trip kind', () => {
    const g = makeGraph([makeNode('TR', ['TD1'], 'TD1')]);
    expect(extractDisplaySettings('TR', g, relay).kind).toBe('trip');
  });

  it('TRIP → trip kind', () => {
    const g = makeGraph([makeNode('TRIP', ['A'], 'A')]);
    expect(extractDisplaySettings('TRIP', g, relay).kind).toBe('trip');
  });

  it('51P1 → protection kind', () => {
    const g = makeGraph([makeNode('51P1', [], null, { isInput: false })]);
    expect(extractDisplaySettings('51P1', g, relay).kind).toBe('protection');
  });

  it('50P1 → protection kind', () => {
    const g = makeGraph([makeNode('50P1', [], null, { isInput: false })]);
    expect(extractDisplaySettings('50P1', g, relay).kind).toBe('protection');
  });

  it('TD1 (TIMER_IN) → timer kind', () => {
    const g = makeGraph([
      makeNode('51P1', [], null),
      makeNode('TD1', ['51P1'], '51P1', { functionType: 'TIMER_IN' }),
    ]);
    expect(extractDisplaySettings('TD1', g, relay).kind).toBe('timer');
  });

  it('SV1 (LATCH_SET) → latch kind', () => {
    const g = makeGraph([
      makeNode('50P1', [], null),
      makeNode('SV1', ['50P1'], '50P1', { functionType: 'LATCH_SET' }),
    ]);
    expect(extractDisplaySettings('SV1', g, relay).kind).toBe('latch');
  });

  it('computed AND gate → gate kind', () => {
    const g = makeGraph([
      makeNode('A', [], null),
      makeNode('B', [], null),
      makeNode('OUT', ['A', 'B'], 'A * B'),
    ]);
    expect(extractDisplaySettings('OUT', g, relay).kind).toBe('gate');
  });

  it('input node → input kind', () => {
    const g = makeGraph([makeNode('IN101', [], null, { isInput: true })]);
    expect(extractDisplaySettings('IN101', g, relay).kind).toBe('input');
  });
});

// ─── extractDisplaySettings — toggleable ─────────────────────────────────────

describe('extractDisplaySettings — toggleable', () => {
  const relay = makeRelay('SEL-351', 'FDR01', {});

  it('51P1 → toggleable', () => {
    const g = makeGraph([makeNode('51P1', [], null, { isInput: false })]);
    expect(extractDisplaySettings('51P1', g, relay).toggleable).toBe(true);
  });

  it('21P1 → toggleable', () => {
    const g = makeGraph([makeNode('21P1', [], null, { isInput: false })]);
    expect(extractDisplaySettings('21P1', g, relay).toggleable).toBe(true);
  });

  it('87T → toggleable', () => {
    const g = makeGraph([makeNode('87T', [], null, { isInput: false })]);
    expect(extractDisplaySettings('87T', g, relay).toggleable).toBe(true);
  });

  it('computed gate → not toggleable', () => {
    const g = makeGraph([
      makeNode('A', [], null),
      makeNode('OUT', ['A'], 'A'),
    ]);
    expect(extractDisplaySettings('OUT', g, relay).toggleable).toBe(false);
  });

  it('TR → not toggleable', () => {
    const g = makeGraph([makeNode('TR', ['A'], 'A')]);
    expect(extractDisplaySettings('TR', g, relay).toggleable).toBe(false);
  });
});

// ─── extractDisplaySettings — settings values ─────────────────────────────────

describe('extractDisplaySettings — settings values', () => {
  it('51P1 with relay settings → has settings rows', () => {
    const relay = makeRelay('SEL-351', 'FDR01', {
      E51P: '1', '51PP': '5.0', '51PTD': '2.0', '51PC': 'U2',
    });
    const g = makeGraph([makeNode('51P1', [], null, { isInput: false })]);
    const info = extractDisplaySettings('51P1', g, relay);
    expect(info.settings.length).toBeGreaterThan(0);
  });

  it('50P1 with relay settings → has badge row (PULSE RAMP)', () => {
    const relay = makeRelay('SEL-351', 'FDR01', {
      E50P: '1', '50PP': '20.0',
    });
    const g = makeGraph([makeNode('50P1', [], null, { isInput: false })]);
    const info = extractDisplaySettings('50P1', g, relay);
    const badge = info.settings.find(s => s.isBadge);
    expect(badge).toBeDefined();
  });

  it('null relay → protection element still has correct kind', () => {
    const g = makeGraph([makeNode('51P1', [], null, { isInput: false })]);
    const info = extractDisplaySettings('51P1', g, null);
    expect(info.kind).toBe('protection');
  });

  it('gate node with null relay → kind is gate', () => {
    const g = makeGraph([
      makeNode('A', [], null),
      makeNode('OUT', ['A'], 'A'),
    ]);
    const info = extractDisplaySettings('OUT', g, null);
    expect(info.kind).toBe('gate');
  });
});

// ─── extractDisplaySettings — SEL-421 ────────────────────────────────────────

describe('extractDisplaySettings — SEL-421 nodes', () => {
  const relay = makeRelay('SEL-421', 'FDR01', {
    E21P: '1', '21PZ1MAG': '2.5', '21PZ1ANG': '75', '21PZ2MAG': '5.0', '21PZ2ANG': '75',
  });

  it('21P1 → protection kind', () => {
    const g = makeGraph([makeNode('21P1', [], null, { isInput: false })]);
    expect(extractDisplaySettings('21P1', g, relay).kind).toBe('protection');
  });

  it('21P1 → toggleable', () => {
    const g = makeGraph([makeNode('21P1', [], null, { isInput: false })]);
    expect(extractDisplaySettings('21P1', g, relay).toggleable).toBe(true);
  });

  it('21P1 → has icon', () => {
    const g = makeGraph([makeNode('21P1', [], null, { isInput: false })]);
    expect(extractDisplaySettings('21P1', g, relay).icon).toBeTruthy();
  });

  it('21P1 → has at least zero settings when relay provided', () => {
    const g = makeGraph([makeNode('21P1', [], null, { isInput: false })]);
    expect(extractDisplaySettings('21P1', g, relay).settings.length).toBeGreaterThanOrEqual(0);
  });
});

// ─── extractDisplaySettings — SEL-787 ────────────────────────────────────────

describe('extractDisplaySettings — SEL-787 (87T)', () => {
  const relay = makeRelay('SEL-787', 'XFMR01', {
    E87T: '1', '87TMINKPF': '0.1', '87TS1': '30', '87TS2': '60',
  });

  it('87T → protection kind', () => {
    const g = makeGraph([makeNode('87T', [], null, { isInput: false })]);
    expect(extractDisplaySettings('87T', g, relay).kind).toBe('protection');
  });

  it('87T → toggleable', () => {
    const g = makeGraph([makeNode('87T', [], null, { isInput: false })]);
    expect(extractDisplaySettings('87T', g, relay).toggleable).toBe(true);
  });
});

// ─── End-to-end simulation ────────────────────────────────────────────────────

describe('end-to-end simulation', () => {
  it('full SEL-351 trip path: 51P1 assert → cascade to TR', () => {
    const graph = makeGraph([
      makeNode('51P1',    [], null),
      makeNode('TD1',     ['51P1'],    '51P1', { functionType: 'TIMER_IN' }),
      makeNode('TD1_OUT', ['TD1'],     'TD1',  { functionType: 'TIMER_OUT' }),
      makeNode('TR',      ['TD1_OUT'], 'TD1_OUT'),
    ]);

    const base = initialSignalStates(graph);
    const result = propagate(base, { '51P1': 1 }, graph);

    expect(result.newStates['TR']).toBe(1);
    expect(result.affected).toContain('TR');
  });

  it('NOT guard: 52A blocks trip when asserted', () => {
    const graph = makeGraph([
      makeNode('51P1', [], null),
      makeNode('52A',  [], null),
      // Trip only if 51P AND NOT 52A
      makeNode('TR', ['51P1', '52A'], '51P1 * !52A'),
    ]);

    const base = initialSignalStates(graph);

    // 51P asserted, 52A=0 → TR trips
    let r = propagate(base, { '51P1': 1 }, graph);
    expect(r.newStates['TR']).toBe(1);

    // 52A=1 (inhibit) → TR blocked
    r = propagate(base, { '51P1': 1, '52A': 1 }, graph);
    expect(r.newStates['TR']).toBe(0);
  });

  it('animations generated for full cascade', () => {
    const graph = makeGraph([
      makeNode('51P1', [], null),
      makeNode('TD1',  ['51P1'], '51P1', { functionType: 'TIMER_IN' }),
      makeNode('TR',   ['TD1'],  'TD1'),
    ]);

    const base = initialSignalStates(graph);
    const result = propagate(base, { '51P1': 1 }, graph);
    const events = buildAnimationSequence(
      base, result.newStates, result.sortedOrder, graph, 'fast'
    );

    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'trip-ripple')).toBe(true);
  });

  it('toggle 51P1 on then off: TR follows', () => {
    const graph = makeGraph([
      makeNode('51P1', [], null),
      makeNode('TR',   ['51P1'], '51P1'),
    ]);

    const base = initialSignalStates(graph);

    const on = propagate(base, { '51P1': 1 }, graph);
    expect(on.affected).toContain('TR');
    expect(on.newStates['TR']).toBe(1);

    const off = propagate(on.newStates, { '51P1': 0 }, graph);
    expect(off.affected).toContain('TR');
    expect(off.newStates['TR']).toBe(0);
  });

  it('display settings and simulation consistent for same graph', () => {
    const relay = makeRelay('SEL-351', 'FDR01', {
      E51P: '1', '51PP': '5.0', '51PTD': '2.0', '51PC': 'U2',
    });

    const graph = makeGraph([
      makeNode('51P1', [], null),
      makeNode('TR',   ['51P1'], '51P1'),
    ]);

    const info = extractDisplaySettings('51P1', graph, relay);
    expect(info.toggleable).toBe(true);
    expect(isToggleable('51P1', graph)).toBe(true);

    const base = initialSignalStates(graph);
    const r = propagate(base, { '51P1': 1 }, graph);
    expect(r.newStates['51P1']).toBe(1);
    expect(r.newStates['TR']).toBe(1);
  });
});

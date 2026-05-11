/**
 * @module __tests__/timer-layout.test.ts
 *
 * Tests for:
 *  - protection.ts   — needsTimerNode, timerNodeId, isTimerCounterNode
 *  - timerSimulation.ts — createTimerState, startPickupTimer, dropPickup,
 *                         tickTimer, resetTimer, edge style helpers, arc/badge
 *  - layout.ts       — assignTier, computeLayout, nodesInTier, TIER_H_GAP, NODE_V_GAP
 *  - buildReactFlow.ts — TC node chain insertion (three-node model)
 */

import { describe, it, expect } from 'vitest';
import type { SourceRef } from '../relay-adapters/common/types';

import {
  needsTimerNode,
  timerNodeId,
  isTimerCounterNode,
} from '../graph/protection';

import {
  createTimerState,
  startPickupTimer,
  dropPickup,
  tickTimer,
  resetTimer,
  pickupToTcEdgeStyle,
  tcToTripEdgeStyle,
  isTripMoment,
  isDeMoment,
  arcProgress,
  timerBadgeLabel,
  type TimerPhase,
} from '../graph/timerSimulation';

import {
  assignTier,
  computeLayout,
  nodesInTier,
  TIER_H_GAP,
  NODE_V_GAP,
} from '../graph/layout';

import {
  buildReactFlowLayout,
} from '../graph/buildReactFlow';

import type { DependencyGraph, GraphNode } from '../selogic/graph';

// ─── Shared helpers ───────────────────────────────────────────────────────────

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
          functionType: 'GENERAL' as const,
        }
      : undefined,
    dependencies: deps,
    dependents:   [],
    isInput:      opts.isInput ?? (deps.length === 0),
    isOutput:     opts.isOutput ?? false,
    depth:        opts.depth ?? 0,
    ...opts,
  };
}

function makeGraph(nodes: GraphNode[]): DependencyGraph {
  const map = new Map<string, GraphNode>();
  for (const n of nodes) map.set(n.id, n);
  // Populate dependents
  for (const n of nodes) {
    for (const dep of n.dependencies) {
      const depNode = map.get(dep);
      if (depNode && !depNode.dependents.includes(n.id)) {
        depNode.dependents.push(n.id);
      }
    }
  }
  const roots  = nodes.filter(n => n.dependencies.length === 0).map(n => n.id);
  const leaves = nodes.filter(n => n.dependents.length   === 0).map(n => n.id);
  return { nodes: map, roots, leaves };
}

// ─── protection.ts — needsTimerNode ───────────────────────────────────────────

describe('needsTimerNode', () => {
  it('returns true for TOC phase (51P)', () => {
    expect(needsTimerNode('51P1P')).toBe(true);
    expect(needsTimerNode('51P1T')).toBe(true);
  });

  it('returns true for TOC ground (51G)', () => {
    expect(needsTimerNode('51G1P')).toBe(true);
  });

  it('returns true for TOC neutral (51N)', () => {
    expect(needsTimerNode('51N1P')).toBe(true);
  });

  it('returns true for directional TOC (67P)', () => {
    expect(needsTimerNode('67P1P')).toBe(true);
    expect(needsTimerNode('67G1P')).toBe(true);
  });

  it('returns true for distance zone 2 (21P2)', () => {
    expect(needsTimerNode('21P2P')).toBe(true);
    expect(needsTimerNode('21P3P')).toBe(true);
  });

  it('returns true for recloser (79)', () => {
    expect(needsTimerNode('79P')).toBe(true);
    expect(needsTimerNode('79T')).toBe(true);
  });

  it('returns false for instantaneous OC (50x)', () => {
    expect(needsTimerNode('50P1P')).toBe(false);
    expect(needsTimerNode('50G1T')).toBe(false);
  });

  it('returns false for differential (87x)', () => {
    expect(needsTimerNode('87LP')).toBe(false);
    expect(needsTimerNode('87T1T')).toBe(false);
  });

  it('returns false for distance zone 1 (21P1) — instantaneous', () => {
    expect(needsTimerNode('21P1P')).toBe(false);
    expect(needsTimerNode('21P1T')).toBe(false);
  });

  it('returns false for unrelated signals', () => {
    expect(needsTimerNode('TR')).toBe(false);
    expect(needsTimerNode('52A')).toBe(false);
    expect(needsTimerNode('TD1')).toBe(false);
  });
});

// ─── protection.ts — timerNodeId ──────────────────────────────────────────────

describe('timerNodeId', () => {
  it('converts 51P1P → 51P1TC', () => {
    expect(timerNodeId('51P1P')).toBe('51P1TC');
  });

  it('converts 51G1P → 51G1TC', () => {
    expect(timerNodeId('51G1P')).toBe('51G1TC');
  });

  it('converts 51N1P → 51N1TC', () => {
    expect(timerNodeId('51N1P')).toBe('51N1TC');
  });

  it('converts 67P1P → 67P1TC', () => {
    expect(timerNodeId('67P1P')).toBe('67P1TC');
  });

  it('converts 21P2P → 21P2TC (zone 2 — timed)', () => {
    expect(timerNodeId('21P2P')).toBe('21P2TC');
  });

  it('converts 21P3P → 21P3TC (zone 3 — timed)', () => {
    expect(timerNodeId('21P3P')).toBe('21P3TC');
  });

  it('converts 79P → 79TC (recloser)', () => {
    expect(timerNodeId('79P')).toBe('79TC');
  });

  it('also works on trip word bit IDs', () => {
    expect(timerNodeId('51P1T')).toBe('51P1TC');
  });

  it('returns null for instantaneous (50x)', () => {
    expect(timerNodeId('50P1P')).toBeNull();
  });

  it('returns null for differential (87x)', () => {
    expect(timerNodeId('87LP')).toBeNull();
  });

  it('returns null for distance zone 1 (21P1P)', () => {
    expect(timerNodeId('21P1P')).toBeNull();
  });

  it('returns null for non-protection signals', () => {
    expect(timerNodeId('TR')).toBeNull();
    expect(timerNodeId('52A')).toBeNull();
  });
});

// ─── protection.ts — isTimerCounterNode ───────────────────────────────────────

describe('isTimerCounterNode', () => {
  it('returns true for timed TC nodes', () => {
    expect(isTimerCounterNode('51P1TC')).toBe(true);
    expect(isTimerCounterNode('51G1TC')).toBe(true);
    expect(isTimerCounterNode('67P1TC')).toBe(true);
    expect(isTimerCounterNode('21P2TC')).toBe(true);
    expect(isTimerCounterNode('79TC')).toBe(true);
  });

  it('returns false for pickup bits, trip bits, and other signals', () => {
    expect(isTimerCounterNode('51P1P')).toBe(false);
    expect(isTimerCounterNode('51P1T')).toBe(false);
    expect(isTimerCounterNode('50P1TC')).toBe(false); // instantaneous — no TC
    expect(isTimerCounterNode('87LTC')).toBe(false);  // differential — no TC
    expect(isTimerCounterNode('21P1TC')).toBe(false); // zone 1 — no TC
    expect(isTimerCounterNode('TD1')).toBe(false);
    expect(isTimerCounterNode('TC1')).toBe(false);
  });
});

// ─── timerSimulation.ts — createTimerState ────────────────────────────────────

describe('createTimerState', () => {
  it('creates an idle state with correct fields', () => {
    const s = createTimerState('51P1TC', 1.5, 0.1);
    expect(s.nodeId).toBe('51P1TC');
    expect(s.phase).toBe('idle');
    expect(s.puSeconds).toBe(1.5);
    expect(s.doSeconds).toBe(0.1);
    expect(s.elapsedMs).toBe(0);
    expect(s.progress).toBe(0);
    expect(s.countdownText).toBe('');
  });

  it('sets speedMult to 5 when puSeconds > 5', () => {
    const s = createTimerState('51P1TC', 10, 0.1);
    expect(s.speedMult).toBe(5);
  });

  it('sets speedMult to 1 when puSeconds <= 5', () => {
    const s = createTimerState('51P1TC', 5, 0.1);
    expect(s.speedMult).toBe(1);
    const s2 = createTimerState('51P1TC', 2, 0.1);
    expect(s2.speedMult).toBe(1);
  });
});

// ─── timerSimulation.ts — startPickupTimer ────────────────────────────────────

describe('startPickupTimer', () => {
  it('transitions idle → timing-pu', () => {
    const s0 = createTimerState('51P1TC', 2.0, 0.1);
    const s1 = startPickupTimer(s0);
    expect(s1.phase).toBe('timing-pu');
    expect(s1.elapsedMs).toBe(0);
    expect(s1.progress).toBe(0);
    expect(s1.countdownText).toMatch(/s remaining/);
  });

  it('is a no-op when already tripped', () => {
    const s0 = { ...createTimerState('51P1TC', 2.0, 0.1), phase: 'tripped' as TimerPhase };
    expect(startPickupTimer(s0)).toBe(s0);
  });

  it('is a no-op when already timing-pu', () => {
    const s0 = { ...createTimerState('51P1TC', 2.0, 0.1), phase: 'timing-pu' as TimerPhase };
    expect(startPickupTimer(s0)).toBe(s0);
  });
});

// ─── timerSimulation.ts — tickTimer ───────────────────────────────────────────

describe('tickTimer', () => {
  it('advances progress during timing-pu', () => {
    const s0 = startPickupTimer(createTimerState('51P1TC', 2.0, 0.1));
    const s1 = tickTimer(s0, 500); // 500ms of 2000ms = 25%
    expect(s1.phase).toBe('timing-pu');
    expect(s1.progress).toBeCloseTo(0.25, 5);
    expect(s1.elapsedMs).toBe(500);
  });

  it('transitions timing-pu → tripped when elapsed >= puSeconds * 1000', () => {
    const s0 = startPickupTimer(createTimerState('51P1TC', 1.0, 0.1));
    const s1 = tickTimer(s0, 1000);
    expect(s1.phase).toBe('tripped');
    expect(s1.progress).toBe(1.0);
    expect(s1.countdownText).toBe('');
  });

  it('drains arc during timing-do', () => {
    const s0 = dropPickup({ ...createTimerState('51P1TC', 1.0, 1.0), phase: 'tripped' as TimerPhase, progress: 1.0 });
    expect(s0.phase).toBe('timing-do');
    const s1 = tickTimer(s0, 500);
    expect(s1.progress).toBeCloseTo(0.5, 5);
    expect(s1.countdownText).toBe('dropout…');
  });

  it('transitions timing-do → done when elapsed >= doSeconds * 1000', () => {
    const s0 = dropPickup({ ...createTimerState('51P1TC', 1.0, 0.5), phase: 'tripped' as TimerPhase, progress: 1.0 });
    const s1 = tickTimer(s0, 500);
    expect(s1.phase).toBe('done');
    expect(s1.progress).toBe(0);
  });

  it('is a no-op when idle', () => {
    const s0 = createTimerState('51P1TC', 1.0, 0.1);
    expect(tickTimer(s0, 100)).toBe(s0);
  });
});

// ─── timerSimulation.ts — dropPickup ──────────────────────────────────────────

describe('dropPickup', () => {
  it('cancels PU timer (timing-pu → idle)', () => {
    const s0 = startPickupTimer(createTimerState('51P1TC', 2.0, 0.1));
    const s1 = tickTimer(s0, 500);
    const s2 = dropPickup(s1);
    expect(s2.phase).toBe('idle');
    expect(s2.progress).toBe(0);
    expect(s2.elapsedMs).toBe(0);
  });

  it('starts DO timer (tripped → timing-do)', () => {
    const s0 = { ...createTimerState('51P1TC', 1.0, 0.5), phase: 'tripped' as TimerPhase, progress: 1.0 };
    const s1 = dropPickup(s0);
    expect(s1.phase).toBe('timing-do');
    expect(s1.progress).toBe(1.0);
    expect(s1.countdownText).toBe('dropout…');
  });

  it('is a no-op in idle phase', () => {
    const s0 = createTimerState('51P1TC', 1.0, 0.1);
    const s1 = dropPickup(s0);
    expect(s1.phase).toBe('idle');
  });
});

// ─── timerSimulation.ts — resetTimer ──────────────────────────────────────────

describe('resetTimer', () => {
  it('forces state back to idle from tripped phase', () => {
    // Tick the full 2s to reach 'tripped'
    const s0 = startPickupTimer(createTimerState('51P1TC', 2.0, 0.1));
    const s1 = tickTimer(s0, 2000);
    expect(s1.phase).toBe('tripped');
    const s2 = resetTimer(s1);
    expect(s2.phase).toBe('idle');
    expect(s2.progress).toBe(0);
    expect(s2.elapsedMs).toBe(0);
  });

  it('forces state back to idle from timing-pu phase', () => {
    const s0 = startPickupTimer(createTimerState('51P1TC', 2.0, 0.1));
    const s1 = tickTimer(s0, 500);
    expect(s1.phase).toBe('timing-pu');
    const s2 = resetTimer(s1);
    expect(s2.phase).toBe('idle');
    expect(s2.elapsedMs).toBe(0);
  });
});

// ─── timerSimulation.ts — edge style helpers ──────────────────────────────────

describe('pickupToTcEdgeStyle', () => {
  it('idle → idle', ()    => expect(pickupToTcEdgeStyle('idle')).toBe('idle'));
  it('timing-pu → amber-dashes', () => expect(pickupToTcEdgeStyle('timing-pu')).toBe('amber-dashes'));
  it('tripped → green-flowing', () => expect(pickupToTcEdgeStyle('tripped')).toBe('green-flowing'));
  it('timing-do → gray-drain', () => expect(pickupToTcEdgeStyle('timing-do')).toBe('gray-drain'));
  it('done → idle', ()    => expect(pickupToTcEdgeStyle('done')).toBe('idle'));
});

describe('tcToTripEdgeStyle', () => {
  it('idle → idle', ()    => expect(tcToTripEdgeStyle('idle')).toBe('idle'));
  it('timing-pu → idle (trip not yet asserted)', () => expect(tcToTripEdgeStyle('timing-pu')).toBe('idle'));
  it('tripped → green-flowing', () => expect(tcToTripEdgeStyle('tripped')).toBe('green-flowing'));
  it('timing-do → gray-drain', () => expect(tcToTripEdgeStyle('timing-do')).toBe('gray-drain'));
  it('done → idle', ()    => expect(tcToTripEdgeStyle('done')).toBe('idle'));
});

describe('isTripMoment / isDeMoment', () => {
  it('isTripMoment detects timing-pu → tripped transition', () => {
    expect(isTripMoment('timing-pu', 'tripped')).toBe(true);
    expect(isTripMoment('idle', 'tripped')).toBe(false);
    expect(isTripMoment('tripped', 'tripped')).toBe(false);
  });

  it('isDeMoment detects timing-do → done transition', () => {
    expect(isDeMoment('timing-do', 'done')).toBe(true);
    expect(isDeMoment('tripped', 'done')).toBe(false);
    expect(isDeMoment('done', 'idle')).toBe(false);
  });
});

// ─── timerSimulation.ts — arcProgress / timerBadgeLabel ──────────────────────

describe('arcProgress', () => {
  it('returns progress directly for non-timing-pu phases', () => {
    const s = { ...createTimerState('51P1TC', 1.0, 0.5), phase: 'tripped' as TimerPhase, progress: 1.0 };
    expect(arcProgress(s)).toBe(1.0);
  });

  it('scales by speedMult during timing-pu for fast timers', () => {
    const s = createTimerState('51P1TC', 10, 0.1); // 10 s PU → speedMult = 5
    const sPU = { ...startPickupTimer(s), elapsedMs: 1000 }; // 1 s elapsed
    // display progress = 1000ms * 5 / 10000ms = 0.5
    expect(arcProgress(sPU)).toBeCloseTo(0.5, 5);
  });

  it('clamps arc progress to 1.0 max', () => {
    const s = createTimerState('51P1TC', 10, 0.1);
    const sPU = { ...startPickupTimer(s), elapsedMs: 99000 }; // way past PU
    expect(arcProgress(sPU)).toBe(1.0);
  });
});

describe('timerBadgeLabel', () => {
  it('returns "5×" badge when timing-pu and speedMult > 1', () => {
    const s = { ...createTimerState('51P1TC', 10, 0.1), phase: 'timing-pu' as TimerPhase };
    expect(timerBadgeLabel(s)).toBe('5×');
  });

  it('returns empty string when speedMult === 1', () => {
    const s = { ...createTimerState('51P1TC', 2.0, 0.1), phase: 'timing-pu' as TimerPhase };
    expect(timerBadgeLabel(s)).toBe('');
  });

  it('returns empty string when not timing-pu', () => {
    const s = createTimerState('51P1TC', 10, 0.1); // idle
    expect(timerBadgeLabel(s)).toBe('');
  });
});

// ─── layout.ts — assignTier ───────────────────────────────────────────────────

describe('assignTier', () => {
  it('assigns tier 0 to input nodes', () => {
    const n = makeNode('52A', [], null, { isInput: true, depth: 0 });
    expect(assignTier('52A', n)).toBe(0);
  });

  it('assigns tier 1 to pickup bits (even when flagged isInput)', () => {
    const n = makeNode('51P1P', [], null, { isInput: true, depth: 1 });
    expect(assignTier('51P1P', n)).toBe(1);
  });

  it('assigns tier 2 to timer-counter (TC) nodes', () => {
    const n = makeNode('51P1TC', [], null, { isInput: false, depth: 2 });
    expect(assignTier('51P1TC', n)).toBe(2);
  });

  it('assigns tier 3 to trip word bits', () => {
    const n = makeNode('51P1T', [], null, { isInput: false, depth: 3 });
    expect(assignTier('51P1T', n)).toBe(3);
  });

  it('assigns tier 6 to trip output (TR)', () => {
    const n = makeNode('TR', [], 'EXPR', { isInput: false, depth: 6 });
    expect(assignTier('TR', n)).toBe(6);
  });

  it('assigns tier 6 to TRIP output', () => {
    const n = makeNode('TRIP', [], 'EXPR', { isInput: false, depth: 6 });
    expect(assignTier('TRIP', n)).toBe(6);
  });
});

// ─── layout.ts — computeLayout ────────────────────────────────────────────────

describe('computeLayout — constants', () => {
  it('exports TIER_H_GAP = 220', () => {
    expect(TIER_H_GAP).toBe(220);
  });

  it('exports NODE_V_GAP = 120', () => {
    expect(NODE_V_GAP).toBe(120);
  });
});

describe('computeLayout — basic position assignment', () => {
  it('places input nodes in tier 0 (x=0)', () => {
    const inp = makeNode('52A', [], null, { isInput: true, depth: 0 });
    const pkp = makeNode('51P1P', ['52A'], null, { isInput: true, depth: 1 });
    const graph = makeGraph([inp, pkp]);
    const layout = computeLayout(graph);
    expect(layout.get('52A')!.x).toBe(0);
    expect(layout.get('52A')!.tier).toBe(0);
  });

  it('places pickup bits in tier 1 (x = TIER_H_GAP)', () => {
    // Pickup bits are isInput=true in the graph, but assignTier puts them in tier 1
    const inp = makeNode('52A', [], null, { isInput: true, depth: 0 });
    const pkp = makeNode('51P1P', [], null, { isInput: true, depth: 0 });
    const graph = makeGraph([inp, pkp]);
    const layout = computeLayout(graph);
    expect(layout.get('51P1P')!.x).toBe(TIER_H_GAP);
    expect(layout.get('51P1P')!.tier).toBe(1);
  });

  it('places trip word bits in tier 3', () => {
    const inp = makeNode('51P1P', [], null, { isInput: true, depth: 0 });
    const twb = makeNode('51P1T', ['51P1P'], '51P1P', { isInput: false, depth: 1 });
    const graph = makeGraph([inp, twb]);
    const layout = computeLayout(graph);
    expect(layout.get('51P1T')!.tier).toBe(3);
    expect(layout.get('51P1T')!.x).toBe(3 * TIER_H_GAP);
  });

  it('places TC nodes in tier 2', () => {
    const tc = makeNode('51P1TC', [], null, { isInput: false, depth: 2 });
    const graph = makeGraph([tc]);
    const layout = computeLayout(graph);
    expect(layout.get('51P1TC')!.tier).toBe(2);
    expect(layout.get('51P1TC')!.x).toBe(2 * TIER_H_GAP);
  });

  it('centres single nodes in a tier at y=0', () => {
    const n = makeNode('TR', [], 'X', { isInput: false, depth: 6 });
    const graph = makeGraph([n]);
    const layout = computeLayout(graph);
    expect(layout.get('TR')!.y).toBe(0);
  });

  it('vertically separates two nodes in same tier by NODE_V_GAP', () => {
    const a = makeNode('51P1P', [], null, { isInput: true, depth: 0 });
    const b = makeNode('51G1P', [], null, { isInput: true, depth: 0 });
    const graph = makeGraph([a, b]);
    const layout = computeLayout(graph);
    const yA = layout.get('51P1P')!.y;
    const yB = layout.get('51G1P')!.y;
    expect(Math.abs(yA - yB)).toBeCloseTo(NODE_V_GAP, 0);
  });
});

describe('nodesInTier', () => {
  it('returns only nodes assigned to the given tier', () => {
    const inp = makeNode('52A', [], null, { isInput: true, depth: 0 });
    // 51P1P is a pickup bit — isInput=true but assignTier → tier 1
    const pkp = makeNode('51P1P', [], null, { isInput: true, depth: 0 });
    const graph = makeGraph([inp, pkp]);
    const layout = computeLayout(graph);

    const tier0 = nodesInTier(layout, 0);
    expect(tier0).toContain('52A');
    expect(tier0).not.toContain('51P1P');

    const tier1 = nodesInTier(layout, 1);
    expect(tier1).toContain('51P1P');
  });
});

// ─── buildReactFlow.ts — TC node chain ───────────────────────────────────────

describe('buildReactFlowLayout — TC node insertion for timed elements', () => {
  const pkpNode  = makeNode('51P1P', [], null, { isInput: true, depth: 0 });
  const tripNode = makeNode('51P1T', ['51P1P'], '51P1P', { isInput: false, depth: 1 });
  const graph    = makeGraph([pkpNode, tripNode]);

  it('inserts a TC node (51P1TC) for a timed element', () => {
    const { nodes } = buildReactFlowLayout(graph, null, {}, () => {});
    const tcNode = nodes.find(n => n.id === '51P1TC');
    expect(tcNode).toBeDefined();
    expect(tcNode!.type).toBe('timerNode');
  });

  it('TC node is positioned between pickup and trip word bit (x axis)', () => {
    const { nodes } = buildReactFlowLayout(graph, null, {}, () => {});
    const pickup = nodes.find(n => n.id === '51P1P')!;
    const tc     = nodes.find(n => n.id === '51P1TC')!;
    const trip   = nodes.find(n => n.id === '51P1T')!;
    expect(tc.position.x).toBeGreaterThan(pickup.position.x);
    expect(tc.position.x).toBeLessThan(trip.position.x);
  });

  it('creates a pickup → TC edge', () => {
    const { edges } = buildReactFlowLayout(graph, null, {}, () => {});
    const e = edges.find(e => e.source === '51P1P' && e.target === '51P1TC');
    expect(e).toBeDefined();
  });

  it('creates a TC → trip word bit edge', () => {
    const { edges } = buildReactFlowLayout(graph, null, {}, () => {});
    const e = edges.find(e => e.source === '51P1TC' && e.target === '51P1T');
    expect(e).toBeDefined();
  });

  it('does NOT create a direct pickup → trip word bit edge when TC chain present', () => {
    const { edges } = buildReactFlowLayout(graph, null, {}, () => {});
    const direct = edges.find(e => e.source === '51P1P' && e.target === '51P1T');
    expect(direct).toBeUndefined();
  });
});

describe('buildReactFlowLayout — no TC node for instantaneous elements', () => {
  it('50x: direct pickup → trip word bit edge, no TC node', () => {
    const pkp  = makeNode('50P1P', [], null, { isInput: true, depth: 0 });
    const trip = makeNode('50P1T', ['50P1P'], '50P1P', { isInput: false, depth: 1 });
    const graph = makeGraph([pkp, trip]);

    const { nodes, edges } = buildReactFlowLayout(graph, null, {}, () => {});
    expect(nodes.find(n => n.id === '50P1TC')).toBeUndefined();
    const direct = edges.find(e => e.source === '50P1P' && e.target === '50P1T');
    expect(direct).toBeDefined();
  });

  it('87x: direct pickup → trip word bit edge, no TC node', () => {
    const pkp  = makeNode('87LP', [], null, { isInput: true, depth: 0 });
    const trip = makeNode('87LT', ['87LP'], '87LP', { isInput: false, depth: 1 });
    const graph = makeGraph([pkp, trip]);

    const { nodes, edges } = buildReactFlowLayout(graph, null, {}, () => {});
    expect(nodes.find(n => n.id === '87LTC')).toBeUndefined();
    const direct = edges.find(e => e.source === '87LP' && e.target === '87LT');
    expect(direct).toBeDefined();
  });

  it('21P1x (zone 1): direct edge, no TC node', () => {
    const pkp  = makeNode('21P1P', [], null, { isInput: true, depth: 0 });
    const trip = makeNode('21P1T', ['21P1P'], '21P1P', { isInput: false, depth: 1 });
    const graph = makeGraph([pkp, trip]);

    const { nodes } = buildReactFlowLayout(graph, null, {}, () => {});
    expect(nodes.find(n => n.id === '21P1TC')).toBeUndefined();
  });
});

describe('buildReactFlowLayout — multiple TC chains', () => {
  it('inserts TC nodes for all timed elements independently', () => {
    const nodes = [
      makeNode('51P1P', [], null, { isInput: true, depth: 0 }),
      makeNode('51P1T', ['51P1P'], '51P1P', { isInput: false, depth: 1 }),
      makeNode('51G1P', [], null, { isInput: true, depth: 0 }),
      makeNode('51G1T', ['51G1P'], '51G1P', { isInput: false, depth: 1 }),
    ];
    const graph = makeGraph(nodes);
    const { nodes: rfNodes } = buildReactFlowLayout(graph, null, {}, () => {});

    expect(rfNodes.find(n => n.id === '51P1TC')).toBeDefined();
    expect(rfNodes.find(n => n.id === '51G1TC')).toBeDefined();
  });
});

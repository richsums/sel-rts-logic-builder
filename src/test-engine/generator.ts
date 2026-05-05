import type { LogicEquation } from '../relay-adapters/common/types';
import type { DependencyGraph } from '../selogic/graph';
import { selectPattern, type PatternId } from './patterns';
import { parseExpression } from '../selogic/parser';
import { collectSignals } from '../selogic/ast';

// ─── Test Step Types ──────────────────────────────────────────────────────────

export type StepType = 'SET' | 'WAIT' | 'CHECK' | 'COMMENT';

export interface TestStep {
  type: StepType;
  signal?: string;
  value?: string | number;
  ms?: number;
  comment?: string;
}

export interface TestState {
  stateNumber: number;
  description: string;
  steps: TestStep[];
}

export interface GeneratedTestCase {
  id: string;
  label: string;
  description: string;
  pattern: PatternId;
  sourceLines: number[];
  states: TestState[];
  signals: string[];
}

// ─── Wait/check constants ─────────────────────────────────────────────────────

const SETTLE_MS  = 50;   // signal propagation settle time (ms)
const INIT_MS    = 100;  // initialisation dwell (ms)
const TIMER_MS   = 500;  // placeholder timer dwell (ms)
const EDGE_MS    = 20;   // rising-edge pulse width (ms)

// ─── Step helpers ─────────────────────────────────────────────────────────────

function setAll(signals: string[], val: 0 | 1): TestStep[] {
  return signals.map(s => ({ type: 'SET' as const, signal: s, value: val }));
}

function comment(text: string): TestStep {
  return { type: 'COMMENT', comment: text };
}

function wait(ms: number): TestStep {
  return { type: 'WAIT', ms };
}

function check(signal: string, val: 0 | 1): TestStep {
  return { type: 'CHECK', signal, value: val };
}

// ─── Pattern generators ───────────────────────────────────────────────────────

function genA(eq: LogicEquation, sigs: string[]): TestState[] {
  const primary = sigs[0] ?? 'IN101';
  return [
    { stateNumber: 1, description: 'Pre-test: de-energise all inputs', steps: [
      comment('Initialise — all inputs LOW'), ...setAll(sigs, 0), wait(INIT_MS), check(eq.label, 0),
    ]},
    { stateNumber: 2, description: `Assert ${primary}`, steps: [
      comment(`Assert primary input ${primary}`), { type: 'SET', signal: primary, value: 1 },
      wait(SETTLE_MS), check(eq.label, 1),
    ]},
    { stateNumber: 3, description: 'Remove input — verify reset', steps: [
      { type: 'SET', signal: primary, value: 0 }, wait(SETTLE_MS), check(eq.label, 0),
    ]},
  ];
}

function genB(eq: LogicEquation, sigs: string[]): TestState[] {
  const supv    = sigs.find(s => /block|supv|en|ctrl|td|pu/i.test(s)) ?? sigs[1] ?? 'IN102';
  const pickup  = sigs.find(s => s !== supv) ?? sigs[0] ?? 'IN101';
  return [
    { stateNumber: 1, description: 'Pre-test', steps: [
      comment('De-energise all'), ...setAll(sigs, 0), wait(INIT_MS), check(eq.label, 0),
    ]},
    { stateNumber: 2, description: 'Assert pickup only — no trip expected', steps: [
      { type: 'SET', signal: pickup, value: 1 }, wait(SETTLE_MS), check(eq.label, 0),
    ]},
    { stateNumber: 3, description: 'Add supervision — verify trip', steps: [
      { type: 'SET', signal: supv, value: 1 }, wait(INIT_MS), check(eq.label, 1),
    ]},
    { stateNumber: 4, description: 'Reset all', steps: [
      ...setAll(sigs, 0), wait(INIT_MS), check(eq.label, 0),
    ]},
  ];
}

function genC(eq: LogicEquation, sigs: string[]): TestState[] {
  if (sigs.length === 0) return genA(eq, sigs);
  return sigs.map((sig, i) => ({
    stateNumber: i + 1,
    description: `OR branch ${i + 1}: assert ${sig} only`,
    steps: [
      comment(`Branch ${i + 1} of ${sigs.length} — ${sig}`),
      ...sigs.map(s => ({ type: 'SET' as const, signal: s, value: s === sig ? 1 : 0 })),
      wait(SETTLE_MS), check(eq.label, 1),
    ],
  }));
}

function genD(eq: LogicEquation, sigs: string[]): TestState[] {
  const setSig   = sigs[0] ?? 'IN101';
  const resetSig = sigs[1] ?? 'IN102';
  return [
    { stateNumber: 1, description: 'Set latch', steps: [
      comment('Pulse set input'), { type: 'SET', signal: setSig, value: 1 },
      wait(SETTLE_MS), { type: 'SET', signal: setSig, value: 0 }, wait(SETTLE_MS),
      check(eq.label, 1),
    ]},
    { stateNumber: 2, description: 'Verify latch holds', steps: [
      comment('No inputs active — latch must retain'), wait(200), check(eq.label, 1),
    ]},
    { stateNumber: 3, description: 'Reset latch', steps: [
      { type: 'SET', signal: resetSig, value: 1 }, wait(SETTLE_MS),
      { type: 'SET', signal: resetSig, value: 0 }, wait(SETTLE_MS),
      check(eq.label, 0),
    ]},
  ];
}

function genE(eq: LogicEquation, sigs: string[]): TestState[] {
  const timerIn = sigs[0] ?? 'IN101';
  return [
    { stateNumber: 1, description: 'Assert timer input — measure operate time', steps: [
      comment('Timer test — operate time per setting'), ...setAll(sigs, 0), wait(INIT_MS),
      { type: 'SET', signal: timerIn, value: 1 }, wait(TIMER_MS), check(eq.label, 1),
    ]},
    { stateNumber: 2, description: 'Remove input — verify dropout', steps: [
      { type: 'SET', signal: timerIn, value: 0 }, wait(INIT_MS), check(eq.label, 0),
    ]},
  ];
}

function genF(eq: LogicEquation, sigs: string[]): TestState[] {
  const blkSig  = sigs.find(s => /blk|block|supv/i.test(s)) ?? sigs[sigs.length - 1] ?? 'IN102';
  const mainSig = sigs.find(s => s !== blkSig) ?? sigs[0] ?? 'IN101';
  return [
    { stateNumber: 1, description: 'Assert block — output must be inhibited', steps: [
      comment('Block asserted before main input'),
      { type: 'SET', signal: blkSig, value: 1 }, { type: 'SET', signal: mainSig, value: 1 },
      wait(SETTLE_MS), check(eq.label, 0),
    ]},
    { stateNumber: 2, description: 'Remove block — output asserts', steps: [
      { type: 'SET', signal: blkSig, value: 0 }, wait(SETTLE_MS), check(eq.label, 1),
    ]},
    { stateNumber: 3, description: 'Reset', steps: [
      ...setAll(sigs, 0), wait(SETTLE_MS), check(eq.label, 0),
    ]},
  ];
}

function genG(eq: LogicEquation, sigs: string[]): TestState[] {
  const remSigs = sigs.filter(s => /^R\d+$/.test(s) || /RX|COMM|REM/i.test(s));
  const locSigs = sigs.filter(s => !remSigs.includes(s));
  return [
    { stateNumber: 1, description: 'Local pickup only — no trip', steps: [
      comment('Local signals only'), ...setAll(locSigs, 1), ...setAll(remSigs, 0),
      wait(SETTLE_MS), check(eq.label, 0),
    ]},
    { stateNumber: 2, description: 'Assert remote permissive — verify trip', steps: [
      comment('Remote bit received'), ...setAll(remSigs, 1), wait(SETTLE_MS), check(eq.label, 1),
    ]},
    { stateNumber: 3, description: 'Reset', steps: [
      ...setAll(sigs, 0), wait(SETTLE_MS), check(eq.label, 0),
    ]},
  ];
}

/** Pattern H — Rising Edge */
function genH(eq: LogicEquation, sigs: string[]): TestState[] {
  const edgeSig = sigs[0] ?? 'IN101';
  return [
    { stateNumber: 1, description: 'Pre-condition: input LOW', steps: [
      comment('Rising-edge test — start with input LOW'), ...setAll(sigs, 0),
      wait(INIT_MS), check(eq.label, 0),
    ]},
    { stateNumber: 2, description: 'Assert rising edge — verify one-shot output', steps: [
      comment('Pulse input HIGH for one scan cycle'),
      { type: 'SET', signal: edgeSig, value: 1 }, wait(EDGE_MS), check(eq.label, 1),
    ]},
    { stateNumber: 3, description: 'Hold input HIGH — verify output drops (one-shot)', steps: [
      comment('Output must NOT re-trigger while input held'),
      wait(200), check(eq.label, 0),
    ]},
    { stateNumber: 4, description: 'Lower then re-raise — verify second edge', steps: [
      { type: 'SET', signal: edgeSig, value: 0 }, wait(EDGE_MS),
      { type: 'SET', signal: edgeSig, value: 1 }, wait(EDGE_MS), check(eq.label, 1),
    ]},
    { stateNumber: 5, description: 'Reset', steps: [
      ...setAll(sigs, 0), wait(SETTLE_MS), check(eq.label, 0),
    ]},
  ];
}

/** Pattern I — Latch Dominance */
function genI(eq: LogicEquation, sigs: string[]): TestState[] {
  const setSig   = sigs[0] ?? 'IN101';
  const resetSig = sigs[1] ?? 'IN102';
  return [
    { stateNumber: 1, description: 'Verify RESET path clears latch', steps: [
      comment('First set the latch'), { type: 'SET', signal: setSig, value: 1 },
      wait(SETTLE_MS), { type: 'SET', signal: setSig, value: 0 }, wait(SETTLE_MS),
      check(eq.label, 1),
      comment('Now reset'), { type: 'SET', signal: resetSig, value: 1 },
      wait(SETTLE_MS), { type: 'SET', signal: resetSig, value: 0 }, wait(SETTLE_MS),
      check(eq.label, 0),
    ]},
    { stateNumber: 2, description: 'Verify SET dominates over simultaneous RESET', steps: [
      comment('Assert both SET and RESET simultaneously'),
      { type: 'SET', signal: setSig, value: 1 }, { type: 'SET', signal: resetSig, value: 1 },
      wait(SETTLE_MS),
      comment('SET should dominate — output HIGH'),
      check(eq.label, 1),
    ]},
    { stateNumber: 3, description: 'Verify latch holds without any input', steps: [
      ...setAll(sigs, 0), wait(200), check(eq.label, 1),
    ]},
    { stateNumber: 4, description: 'Final reset', steps: [
      { type: 'SET', signal: resetSig, value: 1 }, wait(SETTLE_MS),
      { type: 'SET', signal: resetSig, value: 0 }, wait(SETTLE_MS), check(eq.label, 0),
    ]},
  ];
}

/** Pattern J — Communications-Assisted Trip (POTT/PUTT) */
function genJ(eq: LogicEquation, sigs: string[]): TestState[] {
  const remSigs = sigs.filter(s => /RX|RXWI|COMM_IN|REM|POTT|PUTT/i.test(s));
  const locSigs = sigs.filter(s => !remSigs.includes(s));
  const remSig  = remSigs[0] ?? 'RXWI';
  return [
    { stateNumber: 1, description: 'Pre-test: all inputs de-energised', steps: [
      comment('POTT test — initialise'), ...setAll(sigs, 0), wait(INIT_MS), check(eq.label, 0),
    ]},
    { stateNumber: 2, description: 'Local pickup only — no trip (POTT requires remote permissive)', steps: [
      comment('Local OC/dist pickup asserted, no RxWI'), ...setAll(locSigs, 1),
      { type: 'SET', signal: remSig, value: 0 }, wait(SETTLE_MS),
      comment('Expect NO trip'), check(eq.label, 0),
    ]},
    { stateNumber: 3, description: 'Assert RxWI (remote permissive) — verify POTT trip', steps: [
      comment('Remote permissive received — POTT trip expected'),
      { type: 'SET', signal: remSig, value: 1 }, wait(INIT_MS), check(eq.label, 1),
    ]},
    { stateNumber: 4, description: 'Remove remote permissive — verify trip resets', steps: [
      { type: 'SET', signal: remSig, value: 0 }, wait(SETTLE_MS), check(eq.label, 0),
    ]},
    { stateNumber: 5, description: 'Remove local pickup', steps: [
      ...setAll(locSigs, 0), wait(SETTLE_MS), check(eq.label, 0),
    ]},
  ];
}

// ─── Main Generator ───────────────────────────────────────────────────────────

/** Generate a single test case for one logic equation. */
export function generateTestCase(
  eq: LogicEquation,
  _graph: DependencyGraph,
): GeneratedTestCase {
  const ast     = parseExpression(eq.expression);
  const signals = ast ? Array.from(collectSignals(ast)) : [];
  const patternId = selectPattern(eq.functionType, eq.expression, signals);

  let states: TestState[];
  switch (patternId) {
    case 'A': states = genA(eq, signals); break;
    case 'B': states = genB(eq, signals); break;
    case 'C': states = genC(eq, signals); break;
    case 'D': states = genD(eq, signals); break;
    case 'E': states = genE(eq, signals); break;
    case 'F': states = genF(eq, signals); break;
    case 'G': states = genG(eq, signals); break;
    case 'H': states = genH(eq, signals); break;
    case 'I': states = genI(eq, signals); break;
    case 'J': states = genJ(eq, signals); break;
    default:  states = genA(eq, signals);
  }

  return {
    id: `tc-${eq.label}-${patternId}`,
    label: eq.label,
    description: eq.description,
    pattern: patternId,
    sourceLines: [eq.source.lineNumber],
    states,
    signals,
  };
}

/** Generate test cases for all equations in a relay's logic set. */
export function generateAllTestCases(
  equations: LogicEquation[],
  graph: DependencyGraph,
): GeneratedTestCase[] {
  return equations.map(eq => generateTestCase(eq, graph));
}

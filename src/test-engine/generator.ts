import type { LogicEquation } from '../relay-adapters/common/types';
import type { DependencyGraph } from '../selogic/graph';
import { selectPattern, type PatternId } from './patterns';
import { parseExpression } from '../selogic/parser';
import { collectSignals } from '../selogic/ast';
import { enumerateTripPaths, buildInhibitConditions } from '../selogic/trip-paths';

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

  // ── Path-based test metadata (set for TRIP-equation-derived test cases) ──────
  /** The primary protection element that drives trip in this path (e.g. '51PT'). */
  leafElement?: string;
  /** Supervisor signals that must be SET = 1 alongside the leaf for trip. */
  andConditions?: string[];
  /** Blocking signals that must be SET = 0 for the path to be active. */
  notConditions?: string[];

  // ── Inhibit test metadata (set when pattern === 'INHIBIT') ───────────────────
  /** The signal being tested as a block (asserted for NOT, de-asserted for AND). */
  blockingSignal?: string;
  /** Whether the block is via assertion of a NOT guard or de-assertion of an AND supervisor. */
  blockingType?: 'NOT' | 'AND';

  // ── Coverage gap flag ────────────────────────────────────────────────────────
  /** True when no analog injection profile covers this operand. */
  coverageGap?: boolean;
}

// ─── Wait/check constants ─────────────────────────────────────────────────────

const SETTLE_MS  = 50;
const INIT_MS    = 100;
const TIMER_MS   = 500;
const EDGE_MS    = 20;

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

// ─── Pattern generators (non-TRIP equations) ──────────────────────────────────

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
  const supv   = sigs.find(s => /block|supv|en|ctrl|td|pu/i.test(s)) ?? sigs[1] ?? 'IN102';
  const pickup = sigs.find(s => s !== supv) ?? sigs[0] ?? 'IN101';
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

// ─── Standard (non-TRIP) test case generator ──────────────────────────────────

function generateNonTripTestCase(
  eq: LogicEquation,
  _graph: DependencyGraph,
): GeneratedTestCase {
  const ast      = parseExpression(eq.expression);
  const signals  = ast ? Array.from(collectSignals(ast)) : [];
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

// ─── TRIP equation path-based generator ──────────────────────────────────────

/**
 * Generate test cases for a TRIP-type equation by enumerating every path
 * through the AST that can independently assert the trip output.
 *
 * Returns:
 *   - One positive test case per protection-element leaf operand in the AST
 *   - One INHIBIT test case per NOT condition (blocking signal)
 *   - One INHIBIT test case per AND condition (supervisor signal — de-assertion blocks trip)
 *
 * Falls back to the standard genB approach if no protection elements are found
 * in the AST (e.g., logic-only equations that are typed TRIP).
 */
function generateTripTestCases(
  eq: LogicEquation,
  _graph: DependencyGraph,
): GeneratedTestCase[] {
  const ast = parseExpression(eq.expression);
  if (!ast) return [generateNonTripTestCase(eq, _graph)];

  const paths = enumerateTripPaths(ast);

  // Fallback: no protection elements found — use standard B pattern
  if (paths.length === 0) {
    return [generateNonTripTestCase(eq, _graph)];
  }

  const signals = ast ? Array.from(collectSignals(ast)) : [];
  const result: GeneratedTestCase[] = [];

  // ── Positive test cases (one per leaf protection element) ──────────────────
  for (const path of paths) {
    const leaf = path.leafElement;
    // Select pattern based on the leaf element type (A/E for timers, B for supervised, etc.)
    // We use 'A' as default since the analog renderer drives the actual script structure
    const patternId = selectPattern('TRIP', leaf, [leaf]);
    // For protection elements, override to 'E' (timer/operate) if the element is a TOC timer
    const isTocTimer = /T$/.test(leaf.toUpperCase()) && /^(51|67|SEF)/.test(leaf.toUpperCase());
    const chosenPattern: PatternId = isTocTimer ? 'E' : (patternId === 'J' ? 'E' : patternId);

    result.push({
      id: `trip-path-${eq.label}-${leaf}`,
      label: leaf,
      description: `${eq.label} positive test via ${leaf}`,
      pattern: chosenPattern,
      sourceLines: [eq.source.lineNumber],
      states: [],  // analog renderer builds its own states
      signals,
      leafElement: leaf,
      andConditions: path.andConditions,
      notConditions: path.notConditions,
    });
  }

  // ── INHIBIT test cases (one per NOT condition + one per AND supervisor) ─────
  const inhibits = buildInhibitConditions(paths);
  for (const inh of inhibits) {
    const leaf = inh.leafElement;
    const label = `${leaf}_INHIBIT_${inh.signal}`;
    result.push({
      id: `inhibit-${eq.label}-${leaf}-${inh.signal}`,
      label,
      description: `${eq.label} inhibit test — ${inh.signal} ${inh.blockType === 'NOT' ? 'HIGH' : 'LOW'} blocks trip via ${leaf}`,
      pattern: 'INHIBIT',
      sourceLines: [eq.source.lineNumber],
      states: [],
      signals,
      leafElement: leaf,
      andConditions: inh.otherAndConditions,
      notConditions: inh.otherNotConditions,
      blockingSignal: inh.signal,
      blockingType: inh.blockType,
    });
  }

  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Generate a single test case for one logic equation (non-TRIP fallback). */
export function generateTestCase(
  eq: LogicEquation,
  graph: DependencyGraph,
): GeneratedTestCase {
  return generateNonTripTestCase(eq, graph);
}

/** Generate test cases for all equations in a relay's logic set. */
export function generateAllTestCases(
  equations: LogicEquation[],
  graph: DependencyGraph,
): GeneratedTestCase[] {
  const result: GeneratedTestCase[] = [];
  for (const eq of equations) {
    if (eq.functionType === 'TRIP') {
      result.push(...generateTripTestCases(eq, graph));
    } else {
      result.push(generateNonTripTestCase(eq, graph));
    }
  }
  return result;
}

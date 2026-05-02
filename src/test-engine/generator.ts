import type { LogicEquation } from '../relay-adapters/common/types';
import type { DependencyGraph } from '../selogic/graph';
import { selectPattern, type PatternId } from './patterns';
import { parseExpression } from '../selogic/parser';
import { collectSignals } from '../selogic/ast';

// ─── Test Step Types ──────────────────────────────────────────────────────────

export interface TestStep {
  type: 'SET' | 'WAIT' | 'CHECK' | 'COMMENT';
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
  signals: string[];   // all signals referenced
}

// ─── Pattern Generators ───────────────────────────────────────────────────────

function genPatternA(eq: LogicEquation, signals: string[]): TestState[] {
  return [
    {
      stateNumber: 1,
      description: 'Pre-test: assert all inputs LOW',
      steps: [
        { type: 'COMMENT', comment: 'Initialize — all inputs de-energized' },
        ...signals.map(s => ({ type: 'SET' as const, signal: s, value: 0 })),
        { type: 'WAIT', ms: 100 },
        { type: 'CHECK', signal: eq.label, value: 0 },
      ],
    },
    {
      stateNumber: 2,
      description: 'Assert primary input HIGH',
      steps: [
        { type: 'COMMENT', comment: `Assert ${signals[0] ?? 'INPUT'} to energize ${eq.label}` },
        { type: 'SET', signal: signals[0] ?? 'IN101', value: 1 },
        { type: 'WAIT', ms: 50 },
        { type: 'CHECK', signal: eq.label, value: 1 },
      ],
    },
    {
      stateNumber: 3,
      description: 'Remove input — verify output resets',
      steps: [
        { type: 'SET', signal: signals[0] ?? 'IN101', value: 0 },
        { type: 'WAIT', ms: 50 },
        { type: 'CHECK', signal: eq.label, value: 0 },
      ],
    },
  ];
}

function genPatternB(eq: LogicEquation, signals: string[]): TestState[] {
  const supervisor = signals.find(s => /block|supv|en|ctrl/i.test(s)) ?? signals[1] ?? 'IN102';
  const pickup = signals.find(s => s !== supervisor) ?? signals[0] ?? 'IN101';
  return [
    {
      stateNumber: 1,
      description: 'Pre-test initialization',
      steps: [
        { type: 'COMMENT', comment: 'De-energize all inputs' },
        ...signals.map(s => ({ type: 'SET' as const, signal: s, value: 0 })),
        { type: 'WAIT', ms: 100 },
        { type: 'CHECK', signal: eq.label, value: 0 },
      ],
    },
    {
      stateNumber: 2,
      description: 'Assert pickup without supervision — expect no trip',
      steps: [
        { type: 'SET', signal: pickup, value: 1 },
        { type: 'WAIT', ms: 50 },
        { type: 'CHECK', signal: eq.label, value: 0 },
      ],
    },
    {
      stateNumber: 3,
      description: 'Enable supervision — verify trip asserts',
      steps: [
        { type: 'SET', signal: supervisor, value: 1 },
        { type: 'WAIT', ms: 100 },
        { type: 'CHECK', signal: eq.label, value: 1 },
      ],
    },
    {
      stateNumber: 4,
      description: 'Reset — verify trip clears',
      steps: [
        { type: 'SET', signal: pickup, value: 0 },
        { type: 'SET', signal: supervisor, value: 0 },
        { type: 'WAIT', ms: 100 },
        { type: 'CHECK', signal: eq.label, value: 0 },
      ],
    },
  ];
}

function genPatternC(eq: LogicEquation, signals: string[]): TestState[] {
  return signals.map((sig, i) => ({
    stateNumber: i + 1,
    description: `Test OR branch ${i + 1}: assert ${sig}`,
    steps: [
      { type: 'COMMENT' as const, comment: `Branch ${i+1} of ${signals.length}` },
      ...signals.map(s => ({ type: 'SET' as const, signal: s, value: s === sig ? 1 : 0 })),
      { type: 'WAIT' as const, ms: 50 },
      { type: 'CHECK' as const, signal: eq.label, value: 1 },
    ],
  }));
}

function genPatternD(eq: LogicEquation, signals: string[]): TestState[] {
  const setSignal = signals[0] ?? 'IN101';
  const resetSignal = signals[1] ?? 'IN102';
  return [
    {
      stateNumber: 1,
      description: 'Set the latch',
      steps: [
        { type: 'SET', signal: setSignal, value: 1 },
        { type: 'WAIT', ms: 50 },
        { type: 'SET', signal: setSignal, value: 0 },
        { type: 'WAIT', ms: 50 },
        { type: 'CHECK', signal: eq.label, value: 1 },
      ],
    },
    {
      stateNumber: 2,
      description: 'Verify latch holds without input',
      steps: [
        { type: 'WAIT', ms: 200 },
        { type: 'CHECK', signal: eq.label, value: 1 },
      ],
    },
    {
      stateNumber: 3,
      description: 'Reset the latch',
      steps: [
        { type: 'SET', signal: resetSignal, value: 1 },
        { type: 'WAIT', ms: 50 },
        { type: 'SET', signal: resetSignal, value: 0 },
        { type: 'WAIT', ms: 50 },
        { type: 'CHECK', signal: eq.label, value: 0 },
      ],
    },
  ];
}

function genPatternE(eq: LogicEquation, signals: string[]): TestState[] {
  return [
    {
      stateNumber: 1,
      description: 'Assert timer input — measure operate time',
      steps: [
        { type: 'COMMENT', comment: 'Timer test — verify operate delay' },
        ...signals.map(s => ({ type: 'SET' as const, signal: s, value: 0 })),
        { type: 'WAIT', ms: 100 },
        { type: 'SET', signal: signals[0] ?? 'IN101', value: 1 },
        { type: 'WAIT', ms: 500 },  // placeholder — real delay from setting
        { type: 'CHECK', signal: eq.label, value: 1 },
      ],
    },
    {
      stateNumber: 2,
      description: 'Remove timer input — verify dropout',
      steps: [
        { type: 'SET', signal: signals[0] ?? 'IN101', value: 0 },
        { type: 'WAIT', ms: 100 },
        { type: 'CHECK', signal: eq.label, value: 0 },
      ],
    },
  ];
}

function genPatternF(eq: LogicEquation, signals: string[]): TestState[] {
  const blockSig = signals.find(s => /block|blk|supv/i.test(s)) ?? signals[signals.length - 1] ?? 'IN102';
  const mainSig = signals.find(s => s !== blockSig) ?? signals[0] ?? 'IN101';
  return [
    {
      stateNumber: 1,
      description: 'Assert blocking signal — verify output inhibited',
      steps: [
        { type: 'SET', signal: blockSig, value: 1 },
        { type: 'SET', signal: mainSig, value: 1 },
        { type: 'WAIT', ms: 100 },
        { type: 'CHECK', signal: eq.label, value: 0 },
      ],
    },
    {
      stateNumber: 2,
      description: 'Remove block — verify output asserts',
      steps: [
        { type: 'SET', signal: blockSig, value: 0 },
        { type: 'WAIT', ms: 100 },
        { type: 'CHECK', signal: eq.label, value: 1 },
      ],
    },
    {
      stateNumber: 3,
      description: 'Reset',
      steps: [
        { type: 'SET', signal: mainSig, value: 0 },
        { type: 'WAIT', ms: 100 },
        { type: 'CHECK', signal: eq.label, value: 0 },
      ],
    },
  ];
}

function genPatternG(eq: LogicEquation, signals: string[]): TestState[] {
  return [
    {
      stateNumber: 1,
      description: 'Pre-test: local inputs only — no trip expected',
      steps: [
        { type: 'COMMENT', comment: 'Comms-assisted trip test' },
        ...signals.filter(s => !/^R\d+$/.test(s)).map(s => ({ type: 'SET' as const, signal: s, value: 1 })),
        { type: 'WAIT', ms: 100 },
        { type: 'CHECK', signal: eq.label, value: 0 },
      ],
    },
    {
      stateNumber: 2,
      description: 'Assert remote permissive — verify trip',
      steps: [
        { type: 'COMMENT', comment: 'Assert remote bit (simulate received signal)' },
        ...signals.filter(s => /^R\d+$/.test(s)).map(s => ({ type: 'SET' as const, signal: s, value: 1 })),
        { type: 'WAIT', ms: 100 },
        { type: 'CHECK', signal: eq.label, value: 1 },
      ],
    },
    {
      stateNumber: 3,
      description: 'Remove remote — verify reset',
      steps: [
        ...signals.map(s => ({ type: 'SET' as const, signal: s, value: 0 })),
        { type: 'WAIT', ms: 100 },
        { type: 'CHECK', signal: eq.label, value: 0 },
      ],
    },
  ];
}

// ─── Main Generator ───────────────────────────────────────────────────────────

export function generateTestCase(
  eq: LogicEquation,
  graph: DependencyGraph
): GeneratedTestCase {
  const patternId = selectPattern(eq.functionType);
  const ast = parseExpression(eq.expression);
  const signalSet = ast ? collectSignals(ast) : new Set<string>();
  const signals = Array.from(signalSet);

  let states: TestState[] = [];
  switch (patternId) {
    case 'A': states = genPatternA(eq, signals); break;
    case 'B': states = genPatternB(eq, signals); break;
    case 'C': states = genPatternC(eq, signals); break;
    case 'D': states = genPatternD(eq, signals); break;
    case 'E': states = genPatternE(eq, signals); break;
    case 'F': states = genPatternF(eq, signals); break;
    case 'G': states = genPatternG(eq, signals); break;
  }

  // Ensure at least one state
  if (states.length === 0) states = genPatternA(eq, signals);

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

export function generateAllTestCases(
  equations: LogicEquation[],
  graph: DependencyGraph
): GeneratedTestCase[] {
  return equations.map(eq => generateTestCase(eq, graph));
}

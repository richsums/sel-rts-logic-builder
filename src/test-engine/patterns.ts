// ─── Test Pattern Library (A–J) ───────────────────────────────────────────────

export type PatternId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

export interface TestPattern {
  id: PatternId;
  name: string;
  description: string;
  applicableTypes: string[];
}

/** All test patterns available in the pattern library. */
export const TEST_PATTERNS: Record<PatternId, TestPattern> = {
  A: {
    id: 'A',
    name: 'Simple Assertion',
    description: 'Set signal high, verify output asserts; remove and verify reset.',
    applicableTypes: ['GENERAL', 'OUTPUT', 'PICKUP'],
  },
  B: {
    id: 'B',
    name: 'Supervised Trip',
    description: 'Enable supervision, assert pickup, verify trip; reset and verify clear.',
    applicableTypes: ['TRIP'],
  },
  C: {
    id: 'C',
    name: 'OR Logic',
    description: 'Test each branch of OR logic independently and verify output asserts.',
    applicableTypes: ['GENERAL', 'TRIP', 'ALARM'],
  },
  D: {
    id: 'D',
    name: 'Latch Set/Reset',
    description: 'Verify Set dominates; latch holds without input; Reset clears latch.',
    applicableTypes: ['LATCH_SET', 'LATCH_RESET'],
  },
  E: {
    id: 'E',
    name: 'Timer Operate/Dropout',
    description: 'Assert timer input, verify operate delay; remove input, verify dropout.',
    applicableTypes: ['TIMER_IN', 'TIMER_OUT'],
  },
  F: {
    id: 'F',
    name: 'Blocking Logic',
    description: 'Assert block signal, verify output inhibited; remove block, verify output asserts.',
    applicableTypes: ['BLOCK', 'TRIP', 'GENERAL'],
  },
  G: {
    id: 'G',
    name: 'Comms-Assisted (legacy)',
    description: 'Assert remote bit, verify trip; remove, verify reset.',
    applicableTypes: ['TRIP', 'GENERAL'],
  },
  H: {
    id: 'H',
    name: 'Rising Edge',
    description: 'Set signal low → assert rising edge → verify one-shot output; verify no re-trigger while held.',
    applicableTypes: ['RISING_EDGE'],
  },
  I: {
    id: 'I',
    name: 'Latch Dominance',
    description: 'Test SET and RESET paths separately; verify SET dominates per relay spec; verify RESET clears latch.',
    applicableTypes: ['LATCH_SET', 'LATCH_RESET'],
  },
  J: {
    id: 'J',
    name: 'Comms-Assisted Trip (POTT/PUTT)',
    description: 'Verify local pickup alone does NOT trip; add remote permissive → verify POTT trip; remove permissive → verify reset.',
    applicableTypes: ['COMM_ASSISTED', 'TRIP'],
  },
};

// ─── Constants ────────────────────────────────────────────────────────────────

/** Signals that indicate a comms-assisted (POTT/PUTT/DCB) scheme. */
const COMM_SIGNAL_PATTERNS = /^(RX|TX|RXWI|TXWI|COMM_IN|COMM_OUT|REM|REMOTE|POTT|PUTT)/i;

/** Signals that indicate rising-edge trigger logic. */
const EDGE_SIGNAL_PATTERNS = /^(EDGE|PULSE|R_TRIG|SV\d+S)/i;

/**
 * Select the best test pattern for a given logic function type and expression.
 * Returns the pattern ID as a string.
 */
export function selectPattern(
  functionType: string,
  expression?: string,
  signals?: string[],
): PatternId {
  // Check for rising-edge type first
  if (functionType === 'RISING_EDGE') return 'H';
  if (expression?.includes('^')) return 'H';

  // Check for COMM_ASSISTED type
  if (functionType === 'COMM_ASSISTED') return 'J';
  // Check if any signal looks like a comms signal
  if (signals?.some(s => COMM_SIGNAL_PATTERNS.test(s))) return 'J';

  switch (functionType) {
    case 'TRIP':        return 'B';
    case 'BLOCK':       return 'F';
    case 'LATCH_SET':   return 'I';
    case 'LATCH_RESET': return 'I';
    case 'TIMER_IN':
    case 'TIMER_OUT':   return 'E';
    case 'ALARM':       return 'C';
    case 'DIFFERENTIAL':return 'B';
    case 'RECLOSER':    return 'A';
    case 'OUTPUT':      return 'A';
    case 'PICKUP':      return 'A';
    default:            return 'A';
  }
}

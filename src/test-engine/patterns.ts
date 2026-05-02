// ─── Test Pattern Library (A–G) ───────────────────────────────────────────────

export type PatternId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export interface TestPattern {
  id: PatternId;
  name: string;
  description: string;
  applicableTypes: string[];  // LogicFunctionType values
}

export const TEST_PATTERNS: Record<PatternId, TestPattern> = {
  A: {
    id: 'A',
    name: 'Simple Assertion',
    description: 'Set signal high, verify output asserts',
    applicableTypes: ['GENERAL', 'OUTPUT', 'PICKUP'],
  },
  B: {
    id: 'B',
    name: 'Supervised Trip',
    description: 'Enable supervision signal, assert pickup, verify trip output',
    applicableTypes: ['TRIP'],
  },
  C: {
    id: 'C',
    name: 'OR Logic',
    description: 'Test each branch of OR logic independently',
    applicableTypes: ['GENERAL', 'TRIP', 'ALARM'],
  },
  D: {
    id: 'D',
    name: 'Latch Set/Reset',
    description: 'Verify Set dominates or Reset dominates per relay spec',
    applicableTypes: ['LATCH_SET', 'LATCH_RESET'],
  },
  E: {
    id: 'E',
    name: 'Timer',
    description: 'Test operate/dropout timing per timer setting value',
    applicableTypes: ['TIMER_IN', 'TIMER_OUT'],
  },
  F: {
    id: 'F',
    name: 'Blocking',
    description: 'Assert blocking signal, verify output is inhibited',
    applicableTypes: ['BLOCK', 'TRIP', 'GENERAL'],
  },
  G: {
    id: 'G',
    name: 'Comms-Assisted',
    description: 'Simulate remote signal assertion via communications',
    applicableTypes: ['TRIP', 'GENERAL'],
  },
};

/** Select the best pattern for a given function type */
export function selectPattern(functionType: string): PatternId {
  switch (functionType) {
    case 'TRIP':       return 'B';
    case 'BLOCK':      return 'F';
    case 'LATCH_SET':
    case 'LATCH_RESET': return 'D';
    case 'TIMER_IN':
    case 'TIMER_OUT':  return 'E';
    case 'ALARM':      return 'C';
    case 'OUTPUT':     return 'A';
    case 'PICKUP':     return 'A';
    default:           return 'A';
  }
}

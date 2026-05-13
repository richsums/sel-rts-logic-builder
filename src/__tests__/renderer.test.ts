import { describe, it, expect } from 'vitest';
import { renderRTSScript, isComputedOutput } from '../rts/renderer';
import { validateScript } from '../rts/validator';
import type { GeneratedTestCase } from '../test-engine/generator';
import type { ParsedRelaySettings } from '../relay-adapters/common/types';

const MOCK_RELAY: ParsedRelaySettings = {
  model: 'SEL-351',
  tag: 'TEST01',
  firmware: 'R300',
  settingGroups: [],
  logicEquations: [],
  rawLines: [],
  sourceFile: 'test.txt',
  lineCount: 10,
};

// MOCK_TC uses only external input signals (IN101) — valid for direct SET.
const MOCK_TC: GeneratedTestCase = {
  id: 'tc-TR-B',
  label: 'TR',
  description: 'Trip',
  pattern: 'B',
  sourceLines: [20],
  signals: ['IN101', 'IN102'],
  states: [
    {
      stateNumber: 1,
      description: 'Pre-test',
      steps: [
        { type: 'COMMENT', comment: 'Initialise' },
        { type: 'SET', signal: 'IN101', value: 0 },
        { type: 'WAIT', ms: 100 },
        { type: 'CHECK', signal: 'TR', value: 0 },
      ],
    },
    {
      stateNumber: 2,
      description: 'Assert pickup',
      steps: [
        { type: 'SET', signal: 'IN101', value: 1 },
        { type: 'WAIT', ms: 50 },
        { type: 'CHECK', signal: 'TR', value: 1 },
      ],
    },
  ],
};

// TC_COMPUTED has computed outputs (TR, 51P1T, OUT101) in SET steps — must be blocked.
const TC_COMPUTED: GeneratedTestCase = {
  id: 'tc-guard-test',
  label: 'GUARD_TEST',
  description: 'Computed output guard test',
  pattern: 'A',
  sourceLines: [1],
  signals: ['TR', '51P1T', 'OUT101', 'IN101'],
  states: [
    {
      stateNumber: 1,
      description: 'Test computed output blocking',
      steps: [
        { type: 'SET', signal: 'TR',     value: 1 },
        { type: 'SET', signal: '51P1T',  value: 1 },
        { type: 'SET', signal: 'OUT101', value: 1 },
        { type: 'SET', signal: 'IN101',  value: 1 },  // valid external input
        { type: 'CHECK', signal: 'TR', value: 1 },
      ],
    },
  ],
};

describe('RTS script renderer', () => {
  it('produces a string output', () => {
    const script = renderRTSScript(MOCK_TC, MOCK_RELAY);
    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(0);
  });

  it('includes INIT block', () => {
    const script = renderRTSScript(MOCK_TC, MOCK_RELAY);
    expect(script).toContain('INIT');
  });

  it('includes END marker', () => {
    const script = renderRTSScript(MOCK_TC, MOCK_RELAY);
    expect(script).toContain('END');
  });

  it('includes STATE blocks', () => {
    const script = renderRTSScript(MOCK_TC, MOCK_RELAY);
    expect(script).toContain('STATE 1');
    expect(script).toContain('STATE 2');
  });

  it('includes SET commands for valid external input signals', () => {
    const script = renderRTSScript(MOCK_TC, MOCK_RELAY);
    expect(script).toContain('SET IN101 0');
    expect(script).toContain('SET IN101 1');
  });

  it('includes WAIT commands', () => {
    const script = renderRTSScript(MOCK_TC, MOCK_RELAY);
    expect(script).toContain('WAIT 100');
    expect(script).toContain('WAIT 50');
  });

  it('includes CHECK commands', () => {
    const script = renderRTSScript(MOCK_TC, MOCK_RELAY);
    expect(script).toContain('CHECK TR == 0');
    expect(script).toContain('CHECK TR == 1');
  });

  it('includes header with relay tag', () => {
    const script = renderRTSScript(MOCK_TC, MOCK_RELAY);
    expect(script).toContain('TEST01');
  });

  it('includes source traceability (source file + line)', () => {
    const script = renderRTSScript(MOCK_TC, MOCK_RELAY);
    expect(script).toContain('test.txt');
    expect(script).toContain('20');
  });

  it('includes pattern name in header', () => {
    const script = renderRTSScript(MOCK_TC, MOCK_RELAY);
    expect(script).toContain('Pattern B');
  });

  it('includes comment steps', () => {
    const script = renderRTSScript(MOCK_TC, MOCK_RELAY);
    expect(script).toContain('Initialise');
  });
});

describe('RTS script validator', () => {
  it('validates a correct script', () => {
    const script = renderRTSScript(MOCK_TC, MOCK_RELAY);
    const result = validateScript(script);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('flags missing INIT', () => {
    const result = validateScript('STATE 1\n  SET A 1\nEND\n');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('INIT'))).toBe(true);
  });

  it('flags missing END', () => {
    const result = validateScript('INIT\n  STATE 1\n    SET A 1\n');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('END'))).toBe(true);
  });

  it('warns on no CHECK assertions', () => {
    const result = validateScript('INIT\n  STATE 1\n    SET A 1\n    WAIT 50\nEND\n');
    expect(result.warnings.some(w => w.toLowerCase().includes('check'))).toBe(true);
  });

  it('valid script has no errors', () => {
    const result = validateScript('INIT\n  STATE 1\n    SET A 1\n    CHECK B == 1\nEND\n');
    expect(result.valid).toBe(true);
  });
});

// ─── isComputedOutput unit tests ──────────────────────────────────────────────

describe('isComputedOutput', () => {
  it('identifies TR as a computed output', () => {
    expect(isComputedOutput('TR')).toBe(true);
    expect(isComputedOutput('tr')).toBe(true);
    expect(isComputedOutput('TRIP')).toBe(true);
  });

  it('identifies trip word bits (T suffix) as computed outputs', () => {
    expect(isComputedOutput('50P1T')).toBe(true);
    expect(isComputedOutput('51G1T')).toBe(true);
    expect(isComputedOutput('21P1T')).toBe(true);
    expect(isComputedOutput('87L1T')).toBe(true);
    expect(isComputedOutput('79T')).toBe(true);
  });

  it('identifies pickup bits (P suffix) as computed outputs', () => {
    expect(isComputedOutput('50P1P')).toBe(true);
    expect(isComputedOutput('51G1P')).toBe(true);
    expect(isComputedOutput('87LP')).toBe(true);
  });

  it('identifies output contacts as computed outputs', () => {
    expect(isComputedOutput('OUT101')).toBe(true);
    expect(isComputedOutput('OUT201')).toBe(true);
  });

  it('identifies latch outputs (SVnQ) as computed outputs', () => {
    expect(isComputedOutput('SV1Q')).toBe(true);
    expect(isComputedOutput('SV2Q')).toBe(true);
  });

  it('does NOT flag external inputs', () => {
    expect(isComputedOutput('IN101')).toBe(false);
    expect(isComputedOutput('IN201')).toBe(false);
    expect(isComputedOutput('52A')).toBe(false);
    expect(isComputedOutput('52B')).toBe(false);
  });

  it('does NOT flag comms / received channel signals', () => {
    expect(isComputedOutput('RxWI')).toBe(false);
    expect(isComputedOutput('COMM_IN')).toBe(false);
    expect(isComputedOutput('RCVR')).toBe(false);
  });

  it('does NOT flag blocking signals that are external inputs', () => {
    expect(isComputedOutput('50BF')).toBe(false);
    expect(isComputedOutput('RESET')).toBe(false);
    expect(isComputedOutput('CLOSE')).toBe(false);
  });
});

// ─── Computed output guard in renderRTSScript ─────────────────────────────────

describe('renderRTSScript — computed output guard', () => {
  it('does NOT emit SET TR for the trip output', () => {
    const script = renderRTSScript(TC_COMPUTED, MOCK_RELAY);
    expect(script).not.toContain('SET TR');
  });

  it('does NOT emit SET 51P1T for a trip word bit', () => {
    const script = renderRTSScript(TC_COMPUTED, MOCK_RELAY);
    expect(script).not.toContain('SET 51P1T');
  });

  it('does NOT emit SET OUT101 for an output contact', () => {
    const script = renderRTSScript(TC_COMPUTED, MOCK_RELAY);
    expect(script).not.toContain('SET OUT101');
  });

  it('emits NOTE comment for TR (computed output blocked)', () => {
    const script = renderRTSScript(TC_COMPUTED, MOCK_RELAY);
    expect(script).toContain('NOTE: TR is a computed output');
  });

  it('emits NOTE comment for 51P1T (trip word bit blocked)', () => {
    const script = renderRTSScript(TC_COMPUTED, MOCK_RELAY);
    expect(script).toContain('NOTE: 51P1T is a computed output');
  });

  it('still emits SET IN101 for a valid external input', () => {
    const script = renderRTSScript(TC_COMPUTED, MOCK_RELAY);
    expect(script).toContain('SET IN101 1');
  });

  it('script remains structurally valid despite guard substitutions', () => {
    const script = renderRTSScript(TC_COMPUTED, MOCK_RELAY);
    const result = validateScript(script);
    expect(result.valid).toBe(true);
  });
});

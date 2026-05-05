import { describe, it, expect } from 'vitest';
import { renderRTSScript } from '../rts/renderer';
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

const MOCK_TC: GeneratedTestCase = {
  id: 'tc-TR-B',
  label: 'TR',
  description: 'Trip',
  pattern: 'B',
  sourceLines: [20],
  signals: ['51P1T', '51G1T'],
  states: [
    {
      stateNumber: 1,
      description: 'Pre-test',
      steps: [
        { type: 'COMMENT', comment: 'Initialise' },
        { type: 'SET', signal: '51P1T', value: 0 },
        { type: 'WAIT', ms: 100 },
        { type: 'CHECK', signal: 'TR', value: 0 },
      ],
    },
    {
      stateNumber: 2,
      description: 'Assert pickup',
      steps: [
        { type: 'SET', signal: '51P1T', value: 1 },
        { type: 'WAIT', ms: 50 },
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

  it('includes SET commands', () => {
    const script = renderRTSScript(MOCK_TC, MOCK_RELAY);
    expect(script).toContain('SET 51P1T 0');
    expect(script).toContain('SET 51P1T 1');
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

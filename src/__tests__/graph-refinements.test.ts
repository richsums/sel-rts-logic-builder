import { describe, it, expect } from 'vitest';
import { buildDependencyGraph } from '../selogic/graph';
import { generateAllTestCasesByArea } from '../test-engine/generator';
import type {
  LogicEquation,
  LogicFunctionType,
  ParsedRelaySettings,
  SettingEntry,
} from '../relay-adapters/common/types';

const src = { sourceFile: 'test', lineNumber: 0, rawText: '' };
const eq = (label: string, expression: string, functionType: LogicFunctionType): LogicEquation =>
  ({ label, expression, description: label, source: src, functionType });
const entry = (key: string, value: string): SettingEntry => ({ key, value, source: src });

const EQUATIONS: LogicEquation[] = [
  eq('TR', '51P1T * !BLK', 'TRIP'),
  eq('BLK', '!52A', 'BLOCK'),
  eq('SV2', '67Q1', 'GENERAL'),  // raw SELOGIC variable
];

const RELAY: ParsedRelaySettings = {
  model: 'SEL-351', tag: 'TEST', firmware: '',
  settingGroups: [{
    name: 'SELOGIC',
    entries: [
      entry('OUT101', 'TR'),
      entry('OUT104', 'SV2T'),   // uses the timed SV bit
      entry('LED3', 'TR'),
      entry('SV2PU', '2.00'), entry('SV2DO', '0.50'),
    ],
    source: src,
  }],
  logicEquations: EQUATIONS,
  rawLines: [], sourceFile: 'test', lineCount: 0,
};

describe('SV timed-bit synthesis', () => {
  const graph = buildDependencyGraph([
    ...EQUATIONS,
    eq('OUT104', 'SV2T', 'OUTPUT'),  // reference SV2T so the node exists
  ]);

  it('links SVnT to its raw SVn variable', () => {
    const svt = graph.nodes.get('SV2T');
    expect(svt).toBeDefined();
    expect(svt!.isInput).toBe(false);
    expect(svt!.dependencies).toContain('SV2');
    expect(graph.nodes.get('SV2')!.dependents).toContain('SV2T');
  });
});

describe('generateAllTestCasesByArea', () => {
  const graph = buildDependencyGraph([
    ...EQUATIONS,
    eq('OUT101', 'TR', 'OUTPUT'),
    eq('OUT104', 'SV2T', 'OUTPUT'),
  ]);

  it('produces area-tagged test cases for every area', () => {
    const cases = generateAllTestCasesByArea(graph, RELAY);
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.every(c => !!c.areaLabel)).toBe(true);
    // A trip-logic area test exists.
    expect(cases.some(c => /Trip/i.test(c.areaLabel!))).toBe(true);
  });

  it('returns empty for a null relay', () => {
    expect(generateAllTestCasesByArea(graph, null)).toEqual([]);
  });
});

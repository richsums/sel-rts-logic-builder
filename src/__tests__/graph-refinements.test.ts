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

// ─── SEL-351S real-file conventions (ELR F351A) ──────────────────────────────

import { propagate, initialSignalStates } from '../graph/propagate';
import { partitionGraph } from '../graph/partition';

const SEL351_EQS: LogicEquation[] = [
  eq('TR', '51P1T+51G1T+67P1T+67G1T+67G2T', 'TRIP'),
  eq('ULTR', '!(51P1+51G1)', 'GENERAL'),
  eq('CL', 'CC', 'GENERAL'),
  eq('ULCL', 'TRIP+!(CLOSE+CC+79CY)', 'GENERAL'),
  eq('SET2', '(PB2*!LT5+IN104*LT5)*!LT2', 'LATCH_SET'),
  eq('RST2', '(PB2*!LT5+!IN104*LT5)*LT2', 'LATCH_RESET'),
  eq('SV2', 'TRIP', 'GENERAL'),
  eq('OUT101', 'TRIP', 'OUTPUT'),
  eq('OUT102', 'CLOSE', 'OUTPUT'),
  eq('OUT103', 'TRIP', 'OUTPUT'),
  eq('OUT104', 'SV2T', 'OUTPUT'),
  eq('ALRMOUT', '!(SALARM+HALARM)', 'ALARM'),
  eq('LED2', 'LT2', 'GENERAL'),
];

const SEL351_RELAY: ParsedRelaySettings = {
  model: 'SEL-351', tag: 'ELR', firmware: '',
  settingGroups: [{
    name: 'L1',
    entries: [
      entry('OUT101', 'TRIP'), entry('OUT102', 'CLOSE'),
      entry('OUT103', 'TRIP'), entry('OUT104', 'SV2T'),
      entry('ALRMOUT', '!(SALARM+HALARM)'),
      entry('SV2PU', '20.00'), entry('SV2DO', '6.00'),
      // real Set_1 protection settings
      entry('51P1P', '2.40'), entry('51P1C', 'U4'), entry('51P1TD', '0.50'),
      entry('51G1P', '0.45'), entry('51G1C', 'U4'), entry('51G1TD', '2.00'),
      entry('50G2P', '2.400'), entry('67G2D', '20.00'),
    ],
    source: src,
  }],
  logicEquations: SEL351_EQS,
  rawLines: [], sourceFile: 'test', lineCount: 0,
};

describe('SEL-351S synthesis (TRIP seal, latches)', () => {
  const graph = buildDependencyGraph(SEL351_EQS);

  it('synthesizes TRIP from TR with ULTR unlatch', () => {
    const trip = graph.nodes.get('TRIP');
    expect(trip?.synthetic).toBe('seal');
    expect(trip?.dependencies).toEqual(['TR', 'ULTR']);
  });

  it('asserting 51P1T propagates TR → TRIP → OUT101 and OUT103', () => {
    const r = propagate(initialSignalStates(graph), { '51P1T': 1 }, graph);
    expect(r.newStates['TR']).toBe(1);
    expect(r.newStates['TRIP']).toBe(1);
    expect(r.newStates['OUT101']).toBe(1);
    expect(r.newStates['OUT103']).toBe(1);
  });

  it('TRIP seals in while a pickup holds ULTR low, drops when pickups clear', () => {
    let states = initialSignalStates(graph);
    states = propagate(states, { '51P1': 1, '51P1T': 1 }, graph).newStates;
    expect(states['TRIP']).toBe(1);
    // Timed bit drops but pickup still asserted → ULTR=0 → TRIP stays sealed
    states = propagate(states, { '51P1T': 0 }, graph).newStates;
    expect(states['TRIP']).toBe(1);
    // Pickup clears → ULTR=1 → TRIP unlatches
    states = propagate(states, { '51P1': 0 }, graph).newStates;
    expect(states['TRIP']).toBe(0);
  });

  it('synthesizes LT2 latch that toggles on PB2 press cycles', () => {
    const lt2 = graph.nodes.get('LT2');
    expect(lt2?.synthetic).toBe('latch');
    let states = initialSignalStates(graph);
    states = propagate(states, { PB2: 1 }, graph).newStates;  // press
    expect(states['LT2']).toBe(1);
    states = propagate(states, { PB2: 0 }, graph).newStates;  // release — holds
    expect(states['LT2']).toBe(1);
    states = propagate(states, { PB2: 1 }, graph).newStates;  // press again
    expect(states['LT2']).toBe(0);                             // toggles off
  });

  it('merges all =TRIP contacts into one Trip window with ULTR in its cone', () => {
    const { areas } = partitionGraph(graph, SEL351_RELAY);
    const trip = areas.find(a => /^Trip/.test(a.label));
    expect(trip).toBeDefined();
    expect(trip!.rootIds).toEqual(expect.arrayContaining(['OUT101', 'OUT103', 'TRIP']));
    expect(trip!.nodeIds).toEqual(expect.arrayContaining(['TR', 'ULTR', '51P1T', '67G2T']));
    // No separate window for OUT103
    expect(areas.filter(a => a.rootIds.includes('OUT103'))).toHaveLength(1);
  });

  it('creates an ALRMOUT alarm window', () => {
    const { areas } = partitionGraph(graph, SEL351_RELAY);
    const alarm = areas.find(a => a.rootIds.includes('ALRMOUT'));
    expect(alarm).toBeDefined();
    expect(alarm!.nodeIds).toEqual(expect.arrayContaining(['SALARM', 'HALARM']));
  });

  it('creates an SV2 area containing the SV2→SV2T timed chain', () => {
    const { areas } = partitionGraph(graph, SEL351_RELAY);
    const sv = areas.find(a => a.id === 'area_SV2');
    expect(sv).toBeDefined();
    expect(sv!.nodeIds).toEqual(expect.arrayContaining(['SV2', 'SV2T']));
  });

  it('Close window stops at the TRIP boundary stub (no upstream trip logic)', () => {
    const { areas } = partitionGraph(graph, SEL351_RELAY);
    const close = areas.find(a => /^Close/.test(a.label))!;
    expect(close.nodeIds).toContain('TRIP');           // stub reference
    expect(close.nodeIds).not.toContain('TR');         // trip logic stays in Trip window
    expect(close.nodeIds).not.toContain('51P1T');
  });

  it('creates LT windows and stubs latches in other windows; toggles remove them', () => {
    const withLt = partitionGraph(graph, SEL351_RELAY);
    const lt2 = withLt.areas.find(a => a.id === 'area_LT2');
    expect(lt2).toBeDefined();
    expect(lt2!.nodeIds).toEqual(expect.arrayContaining(['LT2', 'SET2', 'RST2', 'PB2']));
    const withoutLt = partitionGraph(graph, SEL351_RELAY, { includeLt: false });
    expect(withoutLt.areas.some(a => a.kind === 'lt')).toBe(false);
    const withoutSv = partitionGraph(graph, SEL351_RELAY, { includeSv: false });
    expect(withoutSv.areas.some(a => a.kind === 'sv')).toBe(false);
  });

  it('trip-area tests resolve through TR and carry per-element analog leaves', () => {
    const cases = generateAllTestCasesByArea(graph, SEL351_RELAY);
    const tripCases = cases.filter(c => /^Trip/.test(c.areaLabel ?? ''));
    expect(tripCases.length).toBeGreaterThanOrEqual(5);          // one per leaf element
    const leaves = tripCases.map(c => c.leafElement).filter(Boolean);
    expect(leaves).toEqual(expect.arrayContaining(['51P1T', '51G1T', '67G2T']));
  });
});

describe('SEL-351 pickup extraction for analog scripts', () => {
  it('resolves instance keys for word bits (51P1T → 51P1P / 51P1C / 51P1TD)', async () => {
    const { buildSettingsMap, extractPickupSetting, extractTimeDial, extractCurveType } =
      await import('../rts/settings-extractor');
    const map = buildSettingsMap(SEL351_RELAY);
    expect(extractPickupSetting(map, '51P1T')).toMatchObject({ value: 2.4, isDefault: false });
    expect(extractTimeDial(map, '51P1T')).toMatchObject({ value: 0.5, isDefault: false });
    expect(extractCurveType(map, '51P1T')).toBe('U4');
    // 67-series uses the 50-series threshold setting
    expect(extractPickupSetting(map, '67G2T')).toMatchObject({ value: 2.4, isDefault: false });
    expect(extractPickupSetting(map, '51G1')).toMatchObject({ value: 0.45, isDefault: false });
  });
});

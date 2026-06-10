import { describe, it, expect } from 'vitest';
import { buildDependencyGraph } from '../selogic/graph';
import { partitionGraph } from '../graph/partition';
import type {
  LogicEquation,
  LogicFunctionType,
  ParsedRelaySettings,
  SettingEntry,
} from '../relay-adapters/common/types';

const src = { sourceFile: 'test', lineNumber: 0, rawText: '' };

function eq(label: string, expression: string, functionType: LogicFunctionType): LogicEquation {
  return { label, expression, description: label, source: src, functionType };
}

function entry(key: string, value: string): SettingEntry {
  return { key, value, source: src };
}

function makeRelay(entries: SettingEntry[]): ParsedRelaySettings {
  return {
    model: 'SEL-351',
    tag: 'TEST',
    firmware: '',
    settingGroups: [{ name: 'MAIN', entries, source: src }],
    logicEquations: [],
    rawLines: [],
    sourceFile: 'test',
    lineCount: 0,
  };
}

const EQUATIONS: LogicEquation[] = [
  eq('TR', '51P1T + SV1', 'TRIP'),
  eq('SV1S', 'IN101', 'LATCH_SET'),
  eq('SV1R', 'IN102', 'LATCH_RESET'),
];

const RELAY = makeRelay([
  entry('OUT101', 'TR'),
  entry('OUT104', '0'),    // disabled — must NOT produce an area
  entry('LED3', 'TR'),
  entry('LED5', 'NA'),     // disabled LED
  entry('PB1', 'IN101'),
]);

describe('partitionGraph', () => {
  const graph = buildDependencyGraph(EQUATIONS);

  it('creates one area per driven output contact and merges the routed coil', () => {
    const { areas } = partitionGraph(graph, RELAY);
    const out = areas.find(a => a.id === 'area_OUT101');
    expect(out).toBeDefined();
    expect(out!.kind).toBe('output');
    expect(out!.label).toBe('Trip — OUT101 / TR');
    // Cone contains the trip word bit and the SV bit it depends on.
    expect(out!.nodeIds).toEqual(expect.arrayContaining(['OUT101', 'TR', '51P1T', 'SV1']));
  });

  it('excludes output contacts that drive nothing (OUT104 = 0)', () => {
    const { areas } = partitionGraph(graph, RELAY);
    expect(areas.some(a => a.id === 'area_OUT104')).toBe(false);
  });

  it('reports the upstream signals used by output logic', () => {
    const { usedSignalIds } = partitionGraph(graph, RELAY);
    expect(usedSignalIds.has('51P1T')).toBe(true);
    expect(usedSignalIds.has('SV1')).toBe(true);
  });

  it('creates an SV area only for SVs used in other logic', () => {
    const { areas } = partitionGraph(graph, RELAY);
    const sv = areas.find(a => a.id === 'area_SV1');
    expect(sv).toBeDefined();
    expect(sv!.kind).toBe('sv');
    expect(sv!.nodeIds).toEqual(expect.arrayContaining(['SV1', 'SV1S', 'SV1R']));
  });

  it('omits LED/PB areas unless includeLedPb is set', () => {
    const { areas } = partitionGraph(graph, RELAY);
    expect(areas.some(a => a.kind === 'led' || a.kind === 'pb')).toBe(false);
  });

  it('includes only enabled LEDs and PBs when includeLedPb is set', () => {
    const { areas } = partitionGraph(graph, RELAY, { includeLedPb: true });
    expect(areas.some(a => a.id === 'area_LED3')).toBe(true);  // enabled
    expect(areas.some(a => a.id === 'area_LED5')).toBe(false); // NA → disabled
    expect(areas.some(a => a.id === 'area_PB1')).toBe(true);   // enabled
  });
});

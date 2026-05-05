import { describe, it, expect } from 'vitest';
import { buildDependencyGraph } from '../selogic/graph';
import type { LogicEquation } from '../relay-adapters/common/types';

function mkEq(label: string, expr: string, line = 1): LogicEquation {
  return {
    label, expression: expr, description: label,
    functionType: 'GENERAL',
    source: { sourceFile: 'test.txt', lineNumber: line, rawText: `${label}=${expr}` },
  };
}

describe('Dependency graph builder', () => {
  it('creates nodes for each equation', () => {
    const graph = buildDependencyGraph([mkEq('TR', 'A + B')]);
    expect(graph.nodes.has('TR')).toBe(true);
  });

  it('creates input nodes for undefined signals', () => {
    const graph = buildDependencyGraph([mkEq('TR', 'A + B')]);
    expect(graph.nodes.has('A')).toBe(true);
    expect(graph.nodes.has('B')).toBe(true);
    expect(graph.nodes.get('A')?.isInput).toBe(true);
    expect(graph.nodes.get('B')?.isInput).toBe(true);
  });

  it('correctly wires edges: TR depends on 51P1T and 51G1T', () => {
    const eqs = [
      mkEq('TR',    '51P1T + 51G1T'),
      mkEq('51P1T', '51P1'),
      mkEq('51G1T', '51G1'),
    ];
    const graph = buildDependencyGraph(eqs);
    expect(graph.nodes.get('TR')?.dependencies).toContain('51P1T');
    expect(graph.nodes.get('TR')?.dependencies).toContain('51G1T');
  });

  it('wires reverse edges (dependents)', () => {
    const eqs = [mkEq('TR', 'A + B'), mkEq('OUT1', 'TR')];
    const graph = buildDependencyGraph(eqs);
    expect(graph.nodes.get('TR')?.dependents).toContain('OUT1');
  });

  it('identifies root nodes (no dependencies in defined set)', () => {
    const eqs = [mkEq('TR', 'A + B')];
    const graph = buildDependencyGraph(eqs);
    expect(graph.roots).toContain('A');
    expect(graph.roots).toContain('B');
  });

  it('identifies leaf nodes (no dependents)', () => {
    const eqs = [mkEq('TR', 'A'), mkEq('OUT1', 'TR')];
    const graph = buildDependencyGraph(eqs);
    expect(graph.leaves).toContain('OUT1');
  });

  it('marks output signals correctly', () => {
    const eqs = [mkEq('TR', 'A'), mkEq('OUT101', 'TR')];
    const graph = buildDependencyGraph(eqs);
    expect(graph.nodes.get('OUT101')?.isOutput).toBe(true);
    expect(graph.nodes.get('TR')?.isOutput).toBe(true);
  });

  it('computes topological depth', () => {
    const eqs = [
      mkEq('LT1S', 'TR'),
      mkEq('TR', '51P1T'),
      mkEq('51P1T', '51P1'),
    ];
    const graph = buildDependencyGraph(eqs);
    // 51P1 → 51P1T → TR → LT1S: depths 0 → 1 → 2 → 3
    expect(graph.nodes.get('LT1S')?.depth).toBeGreaterThan(graph.nodes.get('TR')!.depth);
    expect(graph.nodes.get('TR')?.depth).toBeGreaterThan(graph.nodes.get('51P1T')!.depth);
  });

  it('handles the POTT scheme (5+ equations)', () => {
    const eqs = [
      mkEq('TR',   'Z1G + POTT + 51PT * !BLK51'),
      mkEq('POTT', '(21P2 + 21G2) * 67P * RxWI'),
      mkEq('TxWI', '(21P2 + 21G2) * 67P'),
      mkEq('BLK21','!52A'),
      mkEq('BLK51','BLK21 + 21P1'),
      mkEq('51PTC','67P * !BLK51'),
    ];
    const graph = buildDependencyGraph(eqs);
    // TR should depend on POTT
    expect(graph.nodes.get('TR')?.dependencies).toContain('POTT');
    // POTT should depend on RxWI (an input)
    expect(graph.nodes.get('RXWI')?.isInput ?? graph.nodes.get('RxWI')?.isInput).toBe(true);
    // BLK51 depends on BLK21
    expect(graph.nodes.get('BLK51')?.dependencies).toContain('BLK21');
  });

  it('handles SEL-787 harmonic restraint scheme', () => {
    const eqs = [
      mkEq('TR',   '87T + REF_TRIP'),
      mkEq('87T',  '87TP + 87TQ * !HARMS'),
      mkEq('HARMS','H2 + H5'),
    ];
    const graph = buildDependencyGraph(eqs);
    expect(graph.nodes.get('TR')?.dependencies).toContain('87T');
    expect(graph.nodes.get('87T')?.dependencies).toContain('HARMS');
  });
});

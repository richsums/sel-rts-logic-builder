import type { GeneratedTestCase } from './generator';
import type { DependencyGraph } from '../selogic/graph';

export interface CoverageReport {
  totalSignals: number;
  testedSignals: string[];
  untestedSignals: string[];
  coveragePercent: number;
  patternCounts: Record<string, number>;
  totalTestCases: number;
}

export function buildCoverageReport(
  testCases: GeneratedTestCase[],
  graph: DependencyGraph
): CoverageReport {
  const allSignals = Array.from(graph.nodes.keys());
  const testedSet = new Set<string>();
  const patternCounts: Record<string, number> = {};

  for (const tc of testCases) {
    testedSet.add(tc.label);
    for (const sig of tc.signals) testedSet.add(sig);
    patternCounts[tc.pattern] = (patternCounts[tc.pattern] ?? 0) + 1;
  }

  const testedSignals = allSignals.filter(s => testedSet.has(s));
  const untestedSignals = allSignals.filter(s => !testedSet.has(s));

  return {
    totalSignals: allSignals.length,
    testedSignals,
    untestedSignals,
    coveragePercent: allSignals.length > 0 ? Math.round((testedSignals.length / allSignals.length) * 100) : 0,
    patternCounts,
    totalTestCases: testCases.length,
  };
}

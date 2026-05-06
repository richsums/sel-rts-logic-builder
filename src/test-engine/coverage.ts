import type { GeneratedTestCase } from './generator';
import type { DependencyGraph } from '../selogic/graph';

// ─── Per-equation coverage record ─────────────────────────────────────────────

export interface EquationCoverage {
  /** The equation label (e.g. 'TR'). */
  equation: string;
  /** Full expression text for the equation. */
  expression: string;
  /** Total number of operands in the trip equation. */
  operands_total: number;
  /** Number of operands with at least one positive test script. */
  operands_covered: number;
  /** Coverage percentage (0–100). */
  coverage_pct: number;
  /** Labels of positive test cases covering this equation. */
  positive_tests: string[];
  /** Labels of inhibit test cases for this equation. */
  inhibit_tests: string[];
  /** Supervisor signals (AND conditions) identified from path enumeration. */
  supervisor_conditions: string[];
  /** Operand names with no positive test script assigned. */
  gaps: string[];
}

// ─── Top-level coverage report ────────────────────────────────────────────────

export interface CoverageReport {
  /** The relay tag (e.g. 'FDR01'). */
  relay_tag: string;
  /** Per-equation detail for TRIP-type equations. */
  trip_equations: EquationCoverage[];
  /** Overall coverage across all operands in all trip equations. */
  overall_coverage_pct: number;

  // ── Legacy fields (kept for backward compat with project store) ────────────
  totalSignals: number;
  testedSignals: string[];
  untestedSignals: string[];
  coveragePercent: number;
  patternCounts: Record<string, number>;
  totalTestCases: number;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildCoverageReport(
  testCases: GeneratedTestCase[],
  graph: DependencyGraph,
): CoverageReport {
  // ── Legacy fields ──────────────────────────────────────────────────────────
  const allSignals  = Array.from(graph.nodes.keys());
  const testedSet   = new Set<string>();
  const patternCounts: Record<string, number> = {};

  for (const tc of testCases) {
    testedSet.add(tc.label);
    for (const sig of tc.signals) testedSet.add(sig);
    if (tc.leafElement) testedSet.add(tc.leafElement);
    patternCounts[tc.pattern] = (patternCounts[tc.pattern] ?? 0) + 1;
  }

  const testedSignals   = allSignals.filter(s => testedSet.has(s));
  const untestedSignals = allSignals.filter(s => !testedSet.has(s));

  // ── Per-equation trip coverage ─────────────────────────────────────────────
  // Group test cases by their source equation label
  // Positive tests: tc.leafElement set, pattern !== 'INHIBIT'
  // Inhibit tests: pattern === 'INHIBIT'
  const positiveByLeaf = new Map<string, string[]>(); // leafElement → [tcLabel]
  const inhibitLabels: string[] = [];
  const allSupervisors = new Set<string>();
  const allLeaves = new Set<string>();

  for (const tc of testCases) {
    if (tc.leafElement && tc.pattern !== 'INHIBIT') {
      allLeaves.add(tc.leafElement);
      const arr = positiveByLeaf.get(tc.leafElement) ?? [];
      arr.push(tc.label);
      positiveByLeaf.set(tc.leafElement, arr);
      for (const s of tc.andConditions ?? []) allSupervisors.add(s);
    }
    if (tc.pattern === 'INHIBIT') {
      inhibitLabels.push(tc.label);
    }
  }

  // Build one EquationCoverage for the aggregate trip equation set
  // (we don't have the original equation text here, so we reconstruct from test cases)
  const tripEquations: EquationCoverage[] = [];

  // Find all unique source lines to identify which equations were TRIP type
  // We use the fact that path-based test cases have leafElement set
  const tripTcGroups = new Map<string, GeneratedTestCase[]>();
  for (const tc of testCases) {
    if (tc.leafElement) {
      // Group by source line (which identifies the originating equation)
      const key = String(tc.sourceLines[0] ?? 0);
      const arr  = tripTcGroups.get(key) ?? [];
      arr.push(tc);
      tripTcGroups.set(key, arr);
    }
  }

  for (const [, group] of tripTcGroups) {
    const positives = group.filter(tc => tc.pattern !== 'INHIBIT');
    const inhibits  = group.filter(tc => tc.pattern === 'INHIBIT');
    const leaves    = [...new Set(positives.map(tc => tc.leafElement!))];
    const supervisors = [...new Set(positives.flatMap(tc => tc.andConditions ?? []))];

    // Coverage: covered if it has at least one positive test
    const covered = leaves.filter(l => (positiveByLeaf.get(l)?.length ?? 0) > 0);
    const pct     = leaves.length > 0
      ? Math.round((covered.length / leaves.length) * 100)
      : 100;

    // Detect gaps: leaves without positive tests
    const gapLeaves = leaves.filter(l => (positiveByLeaf.get(l)?.length ?? 0) === 0);

    tripEquations.push({
      equation: positives[0]?.description?.split(' positive')[0] ?? 'TR',
      expression: positives.map(t => t.leafElement).filter(Boolean).join(' + '),
      operands_total: leaves.length,
      operands_covered: covered.length,
      coverage_pct: pct,
      positive_tests: positives.map(tc => tc.label),
      inhibit_tests: inhibits.map(tc => tc.label),
      supervisor_conditions: supervisors,
      gaps: gapLeaves,
    });
  }

  const totalOperands   = tripEquations.reduce((a, e) => a + e.operands_total, 0);
  const coveredOperands = tripEquations.reduce((a, e) => a + e.operands_covered, 0);
  const overallPct      = totalOperands > 0
    ? Math.round((coveredOperands / totalOperands) * 100)
    : 100;

  return {
    relay_tag: '',  // filled in by caller if needed
    trip_equations: tripEquations,
    overall_coverage_pct: overallPct,
    // legacy fields
    totalSignals: allSignals.length,
    testedSignals,
    untestedSignals,
    coveragePercent: allSignals.length > 0
      ? Math.round((testedSignals.length / allSignals.length) * 100)
      : 0,
    patternCounts,
    totalTestCases: testCases.length,
  };
}

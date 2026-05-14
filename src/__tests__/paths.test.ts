import { describe, it, expect } from 'vitest';
import { parseExpression } from '../selogic/parser';
import {
  enumerateTripPaths,
  buildInhibitConditions,
  type TripPath,
  type InhibitCondition,
} from '../selogic/trip-paths';
import { generateAllTestCases } from '../test-engine/generator';
import { buildSettingsMap } from '../rts/settings-extractor';
import { renderAnalogScript, renderAllAnalogScripts } from '../rts/analog-renderer';
import { buildCoverageReport } from '../test-engine/coverage';
import { buildDependencyGraph } from '../selogic/graph';
import {
  DEMO_SEL351,
  DEMO_SEL421,
  DEMO_SEL751,
  DEMO_SEL787,
} from '../store/demo-data';
import type { GeneratedTestCase } from '../test-engine/generator';

// ─── Helper ───────────────────────────────────────────────────────────────────

function parse(expr: string) {
  const ast = parseExpression(expr);
  if (!ast) throw new Error(`Failed to parse: ${expr}`);
  return ast;
}

function paths(expr: string): TripPath[] {
  return enumerateTripPaths(parse(expr));
}

// NOTE: The SELogic tokenizer normalises all operand names to UPPERCASE.
// So 'RxWI' in an expression becomes 'RXWI' in the AST, paths, and generated labels.

// ─── enumerateTripPaths ───────────────────────────────────────────────────────

describe('enumerateTripPaths — basic OR', () => {
  it('single operand returns one path with no conditions', () => {
    const ps = paths('51PT');
    expect(ps).toHaveLength(1);
    expect(ps[0].leafElement).toBe('51PT');
    expect(ps[0].andConditions).toEqual([]);
    expect(ps[0].notConditions).toEqual([]);
  });

  it('two-way OR yields two independent paths', () => {
    const ps = paths('51P + 87L');
    expect(ps).toHaveLength(2);
    const leaves = ps.map(p => p.leafElement);
    expect(leaves).toContain('51P');
    expect(leaves).toContain('87L');
  });

  it('three-way OR yields three paths', () => {
    const ps = paths('21P + 21G + 67P');
    expect(ps).toHaveLength(3);
    const leaves = ps.map(p => p.leafElement);
    expect(leaves).toContain('21P');
    expect(leaves).toContain('21G');
    expect(leaves).toContain('67P');
  });

  it('four-way OR (SEL-711 style) yields four paths', () => {
    const ps = paths('51PT + 51GT + 50P1 + 50G1');
    expect(ps).toHaveLength(4);
    const leaves = ps.map(p => p.leafElement);
    expect(leaves).toContain('51PT');
    expect(leaves).toContain('51GT');
    expect(leaves).toContain('50P1');
    expect(leaves).toContain('50G1');
  });
});

describe('enumerateTripPaths — AND with supervisor', () => {
  it('AND with single supervisor populates andConditions', () => {
    const ps = paths('51PT * 52A');
    // 51PT is a protection element; 52A is a supervisor (not a protection element)
    expect(ps).toHaveLength(1);
    expect(ps[0].leafElement).toBe('51PT');
    expect(ps[0].andConditions).toContain('52A');
    expect(ps[0].notConditions).toEqual([]);
  });

  it('OR inside AND: each OR leaf carries the AND supervisor (tokenizer uppercases RXWI)', () => {
    const ps = paths('(21P + 21G + 67P) * RxWI');
    expect(ps).toHaveLength(3);
    for (const p of ps) {
      // Tokenizer normalises 'RxWI' → 'RXWI'
      expect(p.andConditions).toContain('RXWI');
    }
  });
});

describe('enumerateTripPaths — NOT conditions', () => {
  it('NOT operand appears in notConditions, NOT as a leaf', () => {
    const ps = paths('51PT * !50BF');
    expect(ps).toHaveLength(1);
    expect(ps[0].leafElement).toBe('51PT');
    expect(ps[0].notConditions).toContain('50BF');
    expect(ps.map(p => p.leafElement)).not.toContain('50BF');
  });

  it('multiple NOT conditions all captured', () => {
    const ps = paths('51PT * !50BF * !SOTF_BLK');
    expect(ps).toHaveLength(1);
    expect(ps[0].notConditions).toContain('50BF');
    expect(ps[0].notConditions).toContain('SOTF_BLK');
  });
});

describe('enumerateTripPaths — compound expressions', () => {
  it('SEL-351 TR: 51PT * !50BF * 52A → one path', () => {
    const ps = paths('51PT * !50BF * 52A');
    expect(ps).toHaveLength(1);
    expect(ps[0].leafElement).toBe('51PT');
    expect(ps[0].andConditions).toContain('52A');
    expect(ps[0].notConditions).toContain('50BF');
  });

  it('SEL-421 TR: (21P + 21G + 67P) * RxWI * !BLK → three paths (RXWI uppercase)', () => {
    const ps = paths('(21P + 21G + 67P) * RxWI * !BLK');
    expect(ps).toHaveLength(3);
    for (const p of ps) {
      expect(p.andConditions).toContain('RXWI');  // tokenizer uppercases
      expect(p.notConditions).toContain('BLK');
    }
  });

  it('SEL-751 TR: (50P1 + 51PT * !50BF) * !SOTF_BLK → two paths', () => {
    const ps = paths('(50P1 + 51PT * !50BF) * !SOTF_BLK');
    expect(ps).toHaveLength(2);

    const p50 = ps.find(p => p.leafElement === '50P1');
    expect(p50).toBeDefined();
    expect(p50!.notConditions).toContain('SOTF_BLK');
    expect(p50!.notConditions).not.toContain('50BF');

    const p51 = ps.find(p => p.leafElement === '51PT');
    expect(p51).toBeDefined();
    expect(p51!.notConditions).toContain('SOTF_BLK');
    expect(p51!.notConditions).toContain('50BF');
  });

  it('supervisor signals (52A, RxWI) are NOT returned as leaf paths', () => {
    const ps = paths('(21P + 21G + 67P) * RxWI * !BLK');
    const leaves = ps.map(p => p.leafElement);
    expect(leaves).not.toContain('RXWI');
    expect(leaves).not.toContain('RxWI');
    expect(leaves).not.toContain('BLK');
  });
});

describe('enumerateTripPaths — edge cases', () => {
  it('literal 0 returns no paths', () => {
    expect(paths('0')).toHaveLength(0);
  });

  it('NOT-only expression returns no paths', () => {
    expect(paths('!50BF')).toHaveLength(0);
  });

  it('duplicate leaf element is de-duplicated (fewest conditions wins)', () => {
    const ps = paths('51P + (51P * 52A)');
    const p51 = ps.filter(p => p.leafElement === '51P');
    expect(p51).toHaveLength(1);
    expect(p51[0].andConditions).toEqual([]); // simpler path wins
  });
});

// ─── buildInhibitConditions ───────────────────────────────────────────────────

describe('buildInhibitConditions', () => {
  it('generates NOT-type inhibit for each notCondition', () => {
    const ps = paths('51PT * !50BF * 52A');
    const inhibits = buildInhibitConditions(ps);
    const notInhibit = inhibits.find(i => i.signal === '50BF');
    expect(notInhibit).toBeDefined();
    expect(notInhibit!.blockType).toBe('NOT');
    expect(notInhibit!.leafElement).toBe('51PT');
  });

  it('generates AND-type inhibit for each andCondition (supervisor)', () => {
    const ps = paths('51PT * !50BF * 52A');
    const inhibits = buildInhibitConditions(ps);
    const andInhibit = inhibits.find(i => i.signal === '52A');
    expect(andInhibit).toBeDefined();
    expect(andInhibit!.blockType).toBe('AND');
    expect(andInhibit!.leafElement).toBe('51PT');
  });

  it('SEL-421 generates 3 NOT inhibits (BLK) + 3 AND inhibits (RXWI uppercase)', () => {
    const ps = paths('(21P + 21G + 67P) * RxWI * !BLK');
    const inhibits = buildInhibitConditions(ps);
    const blkInhibits  = inhibits.filter(i => i.signal === 'BLK'  && i.blockType === 'NOT');
    const rxwiInhibits = inhibits.filter(i => i.signal === 'RXWI' && i.blockType === 'AND');  // uppercase
    expect(blkInhibits).toHaveLength(3);   // one per leaf (21P, 21G, 67P)
    expect(rxwiInhibits).toHaveLength(3);
  });

  it('SEL-751: 50P1 has SOTF_BLK inhibit only; 51PT has 50BF + SOTF_BLK inhibits', () => {
    const ps = paths('(50P1 + 51PT * !50BF) * !SOTF_BLK');
    const inhibits = buildInhibitConditions(ps);
    const sotfFor50P = inhibits.filter(i => i.signal === 'SOTF_BLK' && i.leafElement === '50P1');
    const sotfFor51P = inhibits.filter(i => i.signal === 'SOTF_BLK' && i.leafElement === '51PT');
    const bfFor51P   = inhibits.filter(i => i.signal === '50BF'     && i.leafElement === '51PT');
    expect(sotfFor50P).toHaveLength(1);
    expect(sotfFor51P).toHaveLength(1);
    expect(bfFor51P).toHaveLength(1);
  });

  it('de-duplicates: same (signal, leaf) pair appears only once', () => {
    const ps = paths('(21P + 21G) * 52A * !BLK');
    const inhibits = buildInhibitConditions(ps);
    const blkInhibits = inhibits.filter(i => i.signal === 'BLK');
    const uniqueKeys = new Set(blkInhibits.map(i => `${i.leafElement}|${i.signal}`));
    expect(blkInhibits.length).toBe(uniqueKeys.size);
  });
});

// ─── generateAllTestCases — TRIP equation path expansion ─────────────────────

describe('generateAllTestCases — SEL-351 FDR01', () => {
  const graph = buildDependencyGraph(DEMO_SEL351.logicEquations);
  const tcs = generateAllTestCases(DEMO_SEL351.logicEquations, graph);

  it('produces test cases including leafElement for TRIP equation', () => {
    const tripTcs = tcs.filter(tc => tc.leafElement);
    expect(tripTcs.length).toBeGreaterThan(0);
  });

  it('generates one positive test case for 51PT leaf', () => {
    const ptc = tcs.find(tc => tc.leafElement === '51PT' && tc.pattern !== 'INHIBIT');
    expect(ptc).toBeDefined();
    expect(ptc!.andConditions).toContain('52A');
    expect(ptc!.notConditions).toContain('50BF');
  });

  it('generates INHIBIT test case for 50BF (NOT guard)', () => {
    const inh = tcs.find(tc => tc.pattern === 'INHIBIT' && tc.blockingSignal === '50BF');
    expect(inh).toBeDefined();
    expect(inh!.blockingType).toBe('NOT');
    expect(inh!.leafElement).toBe('51PT');
    expect(inh!.label).toContain('INHIBIT');
    expect(inh!.label).toContain('50BF');
  });

  it('generates INHIBIT test case for 52A (AND supervisor)', () => {
    const inh = tcs.find(tc => tc.pattern === 'INHIBIT' && tc.blockingSignal === '52A');
    expect(inh).toBeDefined();
    expect(inh!.blockingType).toBe('AND');
  });

  it('non-TRIP equations (LT1S, ALARM, OUT101) are not path-enumerated', () => {
    const lt1s = tcs.find(tc => tc.label === 'LT1S');
    expect(lt1s).toBeDefined();
    expect(lt1s!.leafElement).toBeUndefined();
  });
});

describe('generateAllTestCases — SEL-421 DTR01', () => {
  const graph = buildDependencyGraph(DEMO_SEL421.logicEquations);
  const tcs = generateAllTestCases(DEMO_SEL421.logicEquations, graph);

  it('generates three positive paths (21P, 21G, 67P)', () => {
    const positives = tcs.filter(tc => tc.leafElement && tc.pattern !== 'INHIBIT');
    const leaves = positives.map(tc => tc.leafElement);
    expect(leaves).toContain('21P');
    expect(leaves).toContain('21G');
    expect(leaves).toContain('67P');
  });

  it('all three paths carry RXWI as AND condition (tokenizer uppercases RxWI)', () => {
    const positives = tcs.filter(tc => tc.leafElement && tc.pattern !== 'INHIBIT');
    for (const p of positives) {
      expect(p.andConditions).toContain('RXWI');  // uppercase from tokenizer
    }
  });

  it('generates INHIBIT tests for BLK (NOT) and RXWI (AND)', () => {
    const inhibits = tcs.filter(tc => tc.pattern === 'INHIBIT');
    const blkInhibits  = inhibits.filter(i => i.blockingSignal === 'BLK');
    const rxwiInhibits = inhibits.filter(i => i.blockingSignal === 'RXWI');  // uppercase
    expect(blkInhibits.length).toBeGreaterThan(0);
    expect(rxwiInhibits.length).toBeGreaterThan(0);
    expect(blkInhibits[0].blockingType).toBe('NOT');
    expect(rxwiInhibits[0].blockingType).toBe('AND');
  });
});

describe('generateAllTestCases — SEL-751 FDR03', () => {
  const graph = buildDependencyGraph(DEMO_SEL751.logicEquations);
  const tcs = generateAllTestCases(DEMO_SEL751.logicEquations, graph);

  it('generates positive tests for 50P1 and 51PT', () => {
    const positives = tcs.filter(tc => tc.leafElement && tc.pattern !== 'INHIBIT');
    const leaves = positives.map(tc => tc.leafElement);
    expect(leaves).toContain('50P1');
    expect(leaves).toContain('51PT');
  });

  it('50P1 path has SOTF_BLK in notConditions', () => {
    const p50 = tcs.find(tc => tc.leafElement === '50P1' && tc.pattern !== 'INHIBIT');
    expect(p50).toBeDefined();
    expect(p50!.notConditions).toContain('SOTF_BLK');
  });

  it('51PT path has both 50BF and SOTF_BLK in notConditions', () => {
    const p51 = tcs.find(tc => tc.leafElement === '51PT' && tc.pattern !== 'INHIBIT');
    expect(p51).toBeDefined();
    expect(p51!.notConditions).toContain('50BF');
    expect(p51!.notConditions).toContain('SOTF_BLK');
  });

  it('generates INHIBIT test for SOTF_BLK', () => {
    const inh = tcs.find(tc => tc.pattern === 'INHIBIT' && tc.blockingSignal === 'SOTF_BLK');
    expect(inh).toBeDefined();
    expect(inh!.blockingType).toBe('NOT');
  });

  it('generates INHIBIT test for 50BF', () => {
    const inh = tcs.find(tc => tc.pattern === 'INHIBIT' && tc.blockingSignal === '50BF');
    expect(inh).toBeDefined();
    expect(inh!.blockingType).toBe('NOT');
    expect(inh!.leafElement).toBe('51PT');
  });
});

// ─── renderAnalogScript — INHIBIT scripts ────────────────────────────────────

function makeInhibitTC(
  leafElement: string,
  blockingSignal: string,
  blockingType: 'NOT' | 'AND',
  andConditions: string[] = [],
  notConditions: string[] = [],
): GeneratedTestCase {
  return {
    id: `inhibit-TR-${leafElement}-${blockingSignal}`,
    label: `${leafElement}_INHIBIT_${blockingSignal}`,
    description: 'Inhibit test',
    pattern: 'INHIBIT',
    sourceLines: [20],
    signals: [leafElement, blockingSignal],
    leafElement,
    blockingSignal,
    blockingType,
    andConditions,
    notConditions,
    states: [],
  };
}

describe('renderAnalogScript — INHIBIT (SEL-351, 51PT blocked by 50BF)', () => {
  const tc = makeInhibitTC('51PT', '50BF', 'NOT', ['52A'], []);
  const script = renderAnalogScript(tc, DEMO_SEL351);

  it('contains INIT and END', () => {
    expect(script).toContain('INIT');
    expect(script.trimEnd()).toMatch(/END\n?$/);
  });

  it('asserts blocking signal to 1 (NOT guard active)', () => {
    expect(script).toContain('SET BINARY 50BF 1');
  });

  it('checks that TRIP is blocked (TRIP == 0)', () => {
    expect(script).toContain('CHECK CONTACT TRIP == 0');
  });

  it('releases block and verifies TRIP asserts (TRIP == 1)', () => {
    expect(script).toContain('SET BINARY 50BF 0');
    expect(script).toContain('CHECK CONTACT TRIP == 1');
  });

  it('verifies element picks up before checking trip is blocked', () => {
    expect(script).toContain('CHECK ELEMENT 51PT == PICKUP');
  });

  it('checks element resets at end', () => {
    expect(script).toContain('CHECK ELEMENT 51PT == RESET');
  });

  it('script header identifies it as a NOT-Condition Inhibit Test', () => {
    expect(script.toLowerCase()).toContain('inhibit');
    expect(script).toContain('50BF');
    expect(script).toContain('NOT');
  });

  it('sets AND supervisor condition in prefault', () => {
    expect(script).toContain('SET BINARY 52A 1');
  });
});

describe('renderAnalogScript — INHIBIT (AND supervisor: 52A missing blocks trip)', () => {
  const tc = makeInhibitTC('51PT', '52A', 'AND', [], ['50BF']);
  const script = renderAnalogScript(tc, DEMO_SEL351);

  it('de-asserts supervisor to 0 (AND guard missing)', () => {
    expect(script).toContain('SET BINARY 52A 0');
  });

  it('restores supervisor to 1 to prove trip', () => {
    expect(script).toContain('SET BINARY 52A 1');
  });

  it('verifies trip blocked (TRIP == 0) while supervisor absent', () => {
    expect(script).toContain('CHECK CONTACT TRIP == 0');
  });

  it('verifies trip asserts (TRIP == 1) once supervisor restored', () => {
    expect(script).toContain('CHECK CONTACT TRIP == 1');
  });

  it('de-asserts the NOT condition (50BF) in prefault', () => {
    expect(script).toContain('SET BINARY 50BF 0');
  });
});

describe('renderAnalogScript — INHIBIT (SEL-421, 21P blocked by BLK)', () => {
  const tc = makeInhibitTC('21P', 'BLK', 'NOT', ['RxWI'], []);
  const script = renderAnalogScript(tc, DEMO_SEL421);

  it('injects voltage (distance element needs VA/IA)', () => {
    expect(script).toContain('INJECT VA');
    expect(script).toContain('INJECT IA');
  });

  it('checks trip blocked and released', () => {
    expect(script).toContain('CHECK CONTACT TRIP == 0');
    expect(script).toContain('CHECK CONTACT TRIP == 1');
  });

  it('sets RxWI as AND supervisor', () => {
    expect(script).toContain('SET BINARY RxWI 1');
  });
});

// ─── Positive path test — supervisor/NOT preamble injected ───────────────────

describe('renderAnalogScript — positive path with conditions (SEL-351)', () => {
  const tc: GeneratedTestCase = {
    id: 'trip-path-TR-51PT',
    label: '51PT',
    description: 'TR positive test via 51PT',
    pattern: 'E',
    sourceLines: [20],
    signals: ['51PT', '50BF', '52A'],
    leafElement: '51PT',
    andConditions: ['52A'],
    notConditions: ['50BF'],
    states: [],
  };
  const script = renderAnalogScript(tc, DEMO_SEL351);

  it('uses constant INJECT for TOC (51P element uses constant-injection profile)', () => {
    expect(script).toContain('INJECT IA');
    expect(script).not.toContain('RAMP IA');
  });

  it('injects SET BINARY 52A 1 as AND supervisor setup', () => {
    expect(script).toContain('SET BINARY 52A 1');
  });

  it('injects SET BINARY 50BF 0 as NOT condition de-assertion', () => {
    expect(script).toContain('SET BINARY 50BF 0');
  });

  it('still contains CHECK ELEMENT with PICKUP and TRIP', () => {
    expect(script).toContain('CHECK ELEMENT');
    expect(script).toContain('PICKUP');
    expect(script).toContain('TRIP');
  });
});

// ─── buildCoverageReport — new format ────────────────────────────────────────

describe('buildCoverageReport — SEL-351', () => {
  const graph = buildDependencyGraph(DEMO_SEL351.logicEquations);
  const tcs   = generateAllTestCases(DEMO_SEL351.logicEquations, graph);
  const rpt   = buildCoverageReport(tcs, graph);

  it('has trip_equations array', () => {
    expect(rpt.trip_equations).toBeInstanceOf(Array);
  });

  it('100% coverage when all leaves have positive tests', () => {
    expect(rpt.overall_coverage_pct).toBe(100);
  });

  it('positive_tests lists at least one test case', () => {
    const eq = rpt.trip_equations[0];
    expect(eq.positive_tests.length).toBeGreaterThan(0);
  });

  it('inhibit_tests lists at least one INHIBIT case', () => {
    const eq = rpt.trip_equations[0];
    expect(eq.inhibit_tests.length).toBeGreaterThan(0);
    expect(eq.inhibit_tests.some(t => t.includes('INHIBIT'))).toBe(true);
  });

  it('supervisor_conditions includes 52A', () => {
    const eq = rpt.trip_equations[0];
    expect(eq.supervisor_conditions).toContain('52A');
  });

  it('gaps is empty (all operands covered)', () => {
    expect(rpt.trip_equations[0].gaps).toHaveLength(0);
  });

  it('legacy fields still present', () => {
    expect(typeof rpt.totalSignals).toBe('number');
    expect(typeof rpt.coveragePercent).toBe('number');
    expect(Array.isArray(rpt.testedSignals)).toBe(true);
    expect(typeof rpt.totalTestCases).toBe('number');
  });
});

describe('buildCoverageReport — SEL-421 three paths', () => {
  const graph = buildDependencyGraph(DEMO_SEL421.logicEquations);
  const tcs   = generateAllTestCases(DEMO_SEL421.logicEquations, graph);
  const rpt   = buildCoverageReport(tcs, graph);

  it('operands_total = 3 (21P, 21G, 67P)', () => {
    const eq = rpt.trip_equations[0];
    expect(eq.operands_total).toBe(3);
  });

  it('operands_covered = 3 (all covered)', () => {
    const eq = rpt.trip_equations[0];
    expect(eq.operands_covered).toBe(3);
    expect(eq.coverage_pct).toBe(100);
  });

  it('inhibit_tests has entries for BLK and RXWI (tokenizer uppercases)', () => {
    const eq = rpt.trip_equations[0];
    expect(eq.inhibit_tests.some(t => t.includes('BLK'))).toBe(true);
    expect(eq.inhibit_tests.some(t => t.includes('RXWI'))).toBe(true);  // uppercase
  });
});

// ─── Coverage — 100% when all leaves tested ──────────────────────────────────

describe('buildCoverageReport — coverage integrity', () => {
  it('overall_coverage_pct = 100 when generator covers all leaves', () => {
    const graph = buildDependencyGraph(DEMO_SEL421.logicEquations);
    const tcs   = generateAllTestCases(DEMO_SEL421.logicEquations, graph);
    const rpt   = buildCoverageReport(tcs, graph);
    // Generator always creates one positive test per path → 100%
    expect(rpt.overall_coverage_pct).toBe(100);
  });

  it('all trip_equations report zero gaps when generator runs normally', () => {
    for (const relay of [DEMO_SEL351, DEMO_SEL421, DEMO_SEL751]) {
      const graph = buildDependencyGraph(relay.logicEquations);
      const tcs   = generateAllTestCases(relay.logicEquations, graph);
      const rpt   = buildCoverageReport(tcs, graph);
      for (const eq of rpt.trip_equations) {
        expect(eq.gaps).toHaveLength(0);
      }
    }
  });

  it('patternCounts includes INHIBIT when inhibit tests exist', () => {
    const graph = buildDependencyGraph(DEMO_SEL351.logicEquations);
    const tcs   = generateAllTestCases(DEMO_SEL351.logicEquations, graph);
    const rpt   = buildCoverageReport(tcs, graph);
    expect(rpt.patternCounts['INHIBIT']).toBeGreaterThan(0);
  });
});

// ─── SEL-787 — differential relay has INHIBIT for !HARMS ─────────────────────

describe('generateAllTestCases — SEL-787 differential', () => {
  const graph = buildDependencyGraph(DEMO_SEL787.logicEquations);
  const tcs   = generateAllTestCases(DEMO_SEL787.logicEquations, graph);

  it('generates TRIP test cases for the TR equation', () => {
    const tripTcs = tcs.filter(tc => tc.leafElement);
    expect(tripTcs.length).toBeGreaterThan(0);
  });

  it('inhibit test count is at least one', () => {
    const inhibits = tcs.filter(tc => tc.pattern === 'INHIBIT');
    expect(inhibits.length).toBeGreaterThan(0);
  });

  it('generates a positive test for 87T differential element', () => {
    const diff = tcs.find(tc => tc.leafElement === '87T' && tc.pattern !== 'INHIBIT');
    expect(diff).toBeDefined();
  });
});

// ─── renderAllAnalogScripts filename format ───────────────────────────────────

describe('renderAllAnalogScripts — filename conventions', () => {
  it('INHIBIT scripts use flat filename without Pat prefix', () => {
    const graph = buildDependencyGraph(DEMO_SEL351.logicEquations);
    const tcs   = generateAllTestCases(DEMO_SEL351.logicEquations, graph);
    const scripts = renderAllAnalogScripts(tcs, DEMO_SEL351);
    const inhibitScripts = scripts.filter(s => s.filename.includes('INHIBIT'));
    expect(inhibitScripts.length).toBeGreaterThan(0);
    for (const s of inhibitScripts) {
      expect(s.filename).not.toContain('Pat');
      expect(s.filename).toMatch(/INHIBIT/);
    }
  });

  it('positive path scripts include Pat<N> or multiplier suffix (_2x/_3x/_4x) in filename', () => {
    const graph = buildDependencyGraph(DEMO_SEL351.logicEquations);
    const tcs   = generateAllTestCases(DEMO_SEL351.logicEquations, graph);
    const scripts = renderAllAnalogScripts(tcs, DEMO_SEL351);
    const positives = scripts.filter(s => !s.filename.includes('INHIBIT'));
    expect(positives.length).toBeGreaterThan(0);
    for (const s of positives) {
      // 51-type elements use _2x/_3x/_4x naming; all other elements use _Pat<N>
      expect(s.filename).toMatch(/(?:Pat[A-Z]|\d+x)\.rts$/);
    }
  });

  it('FDR01_51PT_INHIBIT_50BF.rts is among generated filenames', () => {
    const graph = buildDependencyGraph(DEMO_SEL351.logicEquations);
    const tcs   = generateAllTestCases(DEMO_SEL351.logicEquations, graph);
    const scripts = renderAllAnalogScripts(tcs, DEMO_SEL351);
    const names = scripts.map(s => s.filename);
    expect(names.some(n => n.includes('51PT') && n.includes('INHIBIT') && n.includes('50BF'))).toBe(true);
  });
});

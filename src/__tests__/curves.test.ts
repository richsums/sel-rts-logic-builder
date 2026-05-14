import { describe, it, expect } from 'vitest';
import { computeOperateTimeMs, selCodeToCurveType } from '../rts/curves';
import { generateScriptsForElement } from '../rts/analog-renderer';
import { DEMO_SEL351 } from '../store/demo-data';

// ─── computeOperateTimeMs ─────────────────────────────────────────────────────
//
// Formula: t = TD × K / (M^α − 1) × 1000 ms
//
// Reference values (TD=1, M=2 unless stated):
//   MI:  K=0.0515, α=0.02  → 0.0515 / (2^0.02−1) × 1000 ≈ 3689 ms
//   VI:  K=19.61,  α=2.0   → 19.61  / (2^2  −1)  × 1000 ≈ 6537 ms
//   EI:  K=28.2,   α=2.0   → at M=4, TD=0.5: 0.5×28.2/(16−1)×1000 = 940 ms
//   DT:  t = TD × 1000

describe('computeOperateTimeMs', () => {
  it('MI curve at 2x pickup, TD=1: ~3689 ms', () => {
    expect(computeOperateTimeMs('MI', 1.0, 2.0)).toBeCloseTo(3689, 0);
  });

  it('VI curve at 2x pickup, TD=1: ~6537 ms', () => {
    expect(computeOperateTimeMs('VI', 1.0, 2.0)).toBeCloseTo(6537, 0);
  });

  it('EI curve at 4x pickup, TD=0.5: ~940 ms', () => {
    // 0.5 × 28.2 / (4^2 − 1) × 1000 = 14100 / 15 = 940 ms
    expect(computeOperateTimeMs('EI', 0.5, 4.0)).toBeCloseTo(940, 0);
  });

  it('DT curve, TD=0.5: exactly 500 ms regardless of M', () => {
    expect(computeOperateTimeMs('DT', 0.5, 5.0)).toBe(500);
  });

  it('throws if M <= 1.0', () => {
    expect(() => computeOperateTimeMs('MI', 1.0, 1.0)).toThrow();
  });

  it('throws if M < 1.0', () => {
    expect(() => computeOperateTimeMs('VI', 1.0, 0.5)).toThrow();
  });

  it('SI curve is slower than MI at same TD and M (larger K relative to denominator)', () => {
    // SI: K=0.14, α=0.02 vs MI: K=0.0515, α=0.02 — same denominator, larger K → slower
    const tMI = computeOperateTimeMs('MI', 1.0, 5.0);
    const tSI = computeOperateTimeMs('SI', 1.0, 5.0);
    expect(tSI).toBeGreaterThan(tMI);
  });

  it('inverse characteristic: higher M gives shorter operate time (VI)', () => {
    const t2x = computeOperateTimeMs('VI', 1.0, 2.0);
    const t4x = computeOperateTimeMs('VI', 1.0, 4.0);
    expect(t4x).toBeLessThan(t2x);
  });

  it('IEC_EI at 2x pickup, TD=1: ~26667 ms', () => {
    // 1.0 × 80.0 / (4−1) × 1000 = 80000/3 ≈ 26667 ms
    expect(computeOperateTimeMs('IEC_EI', 1.0, 2.0)).toBeCloseTo(26667, 0);
  });

  it('IEC_VI at 3x pickup, TD=1: ~6750 ms', () => {
    // 1.0 × 13.5 / (3−1) × 1000 = 13500/2 = 6750 ms
    expect(computeOperateTimeMs('IEC_VI', 1.0, 3.0)).toBeCloseTo(6750, 0);
  });
});

// ─── selCodeToCurveType ───────────────────────────────────────────────────────

describe('selCodeToCurveType', () => {
  it('maps U1 → MI', () => expect(selCodeToCurveType('U1')).toBe('MI'));
  it('maps U2 → VI', () => expect(selCodeToCurveType('U2')).toBe('VI'));
  it('maps U3 → EI', () => expect(selCodeToCurveType('U3')).toBe('EI'));
  it('maps C1 → SI', () => expect(selCodeToCurveType('C1')).toBe('SI'));
  it('maps C2 → IEC_VI', () => expect(selCodeToCurveType('C2')).toBe('IEC_VI'));
  it('maps C3 → IEC_EI', () => expect(selCodeToCurveType('C3')).toBe('IEC_EI'));
  it('maps DEF → DT', () => expect(selCodeToCurveType('DEF')).toBe('DT'));
  it('maps DT  → DT', () => expect(selCodeToCurveType('DT')).toBe('DT'));
  it('maps unknown code → MI (fallback)', () => expect(selCodeToCurveType('BOGUS')).toBe('MI'));
  it('is case-insensitive', () => expect(selCodeToCurveType('u1')).toBe('MI'));
});

// ─── 51-element script generation ────────────────────────────────────────────

const demoSEL351Settings = DEMO_SEL351;

describe('51 element script generation', () => {
  it('generates 3 scripts (2x, 3x, 4x) for each 51P element', () => {
    const scripts = generateScriptsForElement('51P', demoSEL351Settings);
    const fiftyOneScripts = scripts.filter(s => s.label.includes('51P'));
    expect(fiftyOneScripts.length).toBeGreaterThanOrEqual(3);
    expect(fiftyOneScripts.some(s => s.label.includes('2x'))).toBe(true);
    expect(fiftyOneScripts.some(s => s.label.includes('3x'))).toBe(true);
    expect(fiftyOneScripts.some(s => s.label.includes('4x'))).toBe(true);
  });

  it('script content uses INJECT not RAMP for 51 element', () => {
    const scripts = generateScriptsForElement('51P', demoSEL351Settings);
    const script2x = scripts.find(s => s.label.includes('2x'));
    expect(script2x?.content).toContain('INJECT IA');
    expect(script2x?.content).not.toContain('RAMP IA');
  });

  it('script header contains expected operate time', () => {
    const scripts = generateScriptsForElement('51P', demoSEL351Settings);
    const script2x = scripts.find(s => s.label.includes('2x'));
    expect(script2x?.content).toContain('Expected Operate Time');
  });

  it('script at 2x has lower fault current than 4x', () => {
    const scripts = generateScriptsForElement('51P', demoSEL351Settings);
    const s2x = scripts.find(s => s.label.includes('2x'))!;
    const s4x = scripts.find(s => s.label.includes('4x'))!;
    // 2× pickup = 10.00 A, 4× pickup = 20.00 A
    expect(s2x.content).toContain('INJECT IA 10.00');
    expect(s4x.content).toContain('INJECT IA 20.00');
  });

  it('each script starts with INIT and ends with END', () => {
    const scripts = generateScriptsForElement('51P', demoSEL351Settings);
    for (const s of scripts) {
      expect(s.content).toContain('INIT');
      expect(s.content.trimEnd()).toMatch(/END\n?$/);
    }
  });

  it('returns empty array for non-51 element types', () => {
    const scripts = generateScriptsForElement('50P', demoSEL351Settings);
    expect(scripts).toHaveLength(0);
  });

  it('3x script has shorter operate-time window than 2x (inverse characteristic)', () => {
    // Higher multiple → shorter operate time
    const scripts = generateScriptsForElement('51P', demoSEL351Settings);
    const s2x = scripts.find(s => s.label.includes('2x'))!;
    const s3x = scripts.find(s => s.label.includes('3x'))!;
    // Extract WAIT value from STATE 3 — format: "WAIT <ms>"
    const waitMs = (s: string) => {
      const m = s.match(/STATE 3[^]*?WAIT (\d+)/);
      return m ? parseInt(m[1], 10) : Infinity;
    };
    expect(waitMs(s3x.content)).toBeLessThan(waitMs(s2x.content));
  });
});

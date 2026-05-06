import { describe, it, expect } from 'vitest';
import { computeOperateTime, computeOperateTimeMs } from '../rts/operate-time';
import {
  classifyElement,
  selectInjectionProfile,
  renderAnalogScript,
} from '../rts/analog-renderer';
import {
  buildSettingsMap,
  extractPickupSetting,
  extractTimeDial,
} from '../rts/settings-extractor';
import {
  DEMO_SEL351,
  DEMO_SEL411L,
  DEMO_SEL421,
  DEMO_SEL711,
  DEMO_SEL751,
  DEMO_SEL787,
  DEMO_SEL2411,
} from '../store/demo-data';
import type { GeneratedTestCase } from '../test-engine/generator';

// ─── Helper ───────────────────────────────────────────────────────────────────

function mockTC(
  label: string,
  pattern: string,
  signals: string[] = [],
  states: GeneratedTestCase['states'] = [],
): GeneratedTestCase {
  return {
    id: `tc-${label}-${pattern}`,
    label,
    description: `Test ${label}`,
    pattern: pattern as GeneratedTestCase['pattern'],
    sourceLines: [10],
    signals,
    states,
  };
}

// ─── computeOperateTime ───────────────────────────────────────────────────────

describe('computeOperateTime', () => {
  it('returns Infinity for M == 1 (no pickup)', () => {
    expect(computeOperateTime('U1', 1.0, 1.0)).toBe(Infinity);
  });

  it('returns Infinity for M < 1 (below pickup)', () => {
    expect(computeOperateTime('U1', 1.0, 0.5)).toBe(Infinity);
  });

  it('IEEE U1 at M=2, TD=0.5 returns reasonable operate time (1–3 s)', () => {
    // U1: TD * (0.0515 / (M^0.02 - 1) + 0.1140)
    const t = computeOperateTime('U1', 0.5, 2.0);
    expect(t).toBeGreaterThan(1.0);
    expect(t).toBeLessThan(3.0);
  });

  it('IEEE U2 (Very Inverse) is faster than U1 at M=5, same TD', () => {
    const tU1 = computeOperateTime('U1', 1.0, 5.0);
    const tU2 = computeOperateTime('U2', 1.0, 5.0);
    expect(tU2).toBeLessThan(tU1);
  });

  it('DEF curve returns TD directly regardless of M', () => {
    expect(computeOperateTime('DEF', 2.5, 10.0)).toBeCloseTo(2.5, 5);
    expect(computeOperateTime('DEF', 0.8, 100.0)).toBeCloseTo(0.8, 5);
  });

  it('computeOperateTimeMs returns milliseconds of computeOperateTime', () => {
    const tSec = computeOperateTime('U1', 1.0, 3.0);
    const tMs  = computeOperateTimeMs('U1', 1.0, 3.0);
    expect(tMs).toBeCloseTo(tSec * 1000, 0);
  });

  it('U1 inverse characteristic: operates faster at higher current multiples', () => {
    const t5x  = computeOperateTime('U1', 1.0, 5.0);
    const t10x = computeOperateTime('U1', 1.0, 10.0);
    expect(t10x).toBeLessThan(t5x);
  });

  it('IEC C1 (Standard Inverse) at M=10, TD=1 returns approx 2.97 s', () => {
    // C1: TD * 0.14 / (M^0.02 - 1) at M=10, TD=1 → 0.14/(10^0.02-1) ≈ 2.97s
    const t = computeOperateTime('C1', 1.0, 10.0);
    expect(t).toBeGreaterThan(2.5);
    expect(t).toBeLessThan(3.5);
  });

  it('unknown curve falls back to U1 formula', () => {
    const tU1      = computeOperateTime('U1', 1.0, 3.0);
    const tUnknown = computeOperateTime('BOGUS', 1.0, 3.0);
    expect(tUnknown).toBeCloseTo(tU1, 6);
  });
});

// ─── selectInjectionProfile ───────────────────────────────────────────────────

describe('selectInjectionProfile', () => {
  it('RAMP for 51P when no 50P present', () => {
    const map = new Map([['51P1P', '5.0']]);
    expect(selectInjectionProfile('51P1TC', map)).toBe('RAMP');
  });

  it('PULSE_RAMP for 50P when 51P is also in settings', () => {
    const map = new Map([['51P1P', '5.0'], ['50P1P', '20.0']]);
    expect(selectInjectionProfile('50P1', map)).toBe('PULSE_RAMP');
  });

  it('RAMP for 50P when no 51P in settings', () => {
    const map = new Map([['50P1P', '20.0']]);
    expect(selectInjectionProfile('50P1', map)).toBe('RAMP');
  });

  it('PULSE_RAMP for 50G when 51GPU present', () => {
    const map = new Map([['51GPU', '1.0'], ['50G1P', '5.0']]);
    expect(selectInjectionProfile('50G1', map)).toBe('PULSE_RAMP');
  });

  it('IMPEDANCE for 21P distance element', () => {
    const map = new Map([['21P1R', '4.5']]);
    expect(selectInjectionProfile('21P1', map)).toBe('IMPEDANCE');
  });

  it('DIFFERENTIAL for 87L line differential', () => {
    expect(selectInjectionProfile('87L', new Map())).toBe('DIFFERENTIAL');
  });

  it('DIFFERENTIAL for 87T transformer differential', () => {
    expect(selectInjectionProfile('87T', new Map())).toBe('DIFFERENTIAL');
  });

  it('DIGITAL for logic-only labels (latch, output, SV)', () => {
    const map = new Map<string, string>();
    expect(selectInjectionProfile('LT1S',  map)).toBe('DIGITAL');
    expect(selectInjectionProfile('OUT101', map)).toBe('DIGITAL');
    expect(selectInjectionProfile('SV1S',  map)).toBe('DIGITAL');
    expect(selectInjectionProfile('ALARM', map)).toBe('DIGITAL');
  });
});

// ─── extractPickupSetting ─────────────────────────────────────────────────────

describe('extractPickupSetting', () => {
  it('reads 51P1P key correctly', () => {
    const map = new Map([['51P1P', '5.00']]);
    const r   = extractPickupSetting(map, '51P');
    expect(r.value).toBeCloseTo(5.0, 2);
    expect(r.key).toBe('51P1P');
    expect(r.isDefault).toBe(false);
  });

  it('falls back to 51PPU when 51P1P absent', () => {
    const map = new Map([['51PPU', '4.50']]);
    const r   = extractPickupSetting(map, '51P');
    expect(r.value).toBeCloseTo(4.5, 2);
    expect(r.isDefault).toBe(false);
  });

  it('returns default and isDefault=true when no key found', () => {
    const r = extractPickupSetting(new Map(), '51P');
    expect(r.isDefault).toBe(true);
    expect(r.value).toBeGreaterThan(0);
  });

  it('reads 50P1P for IOC element', () => {
    const map = new Map([['50P1P', '20.00']]);
    const r   = extractPickupSetting(map, '50P');
    expect(r.value).toBeCloseTo(20.0, 2);
    expect(r.isDefault).toBe(false);
  });

  it('reads 87LP for line differential pickup', () => {
    const map = new Map([['87LP', '0.20']]);
    const r   = extractPickupSetting(map, '87L');
    expect(r.value).toBeCloseTo(0.2, 3);
    expect(r.isDefault).toBe(false);
  });

  it('correctly reads from SEL-351 demo relay settings', () => {
    const map  = buildSettingsMap(DEMO_SEL351);
    const p51  = extractPickupSetting(map, '51P');
    const p50  = extractPickupSetting(map, '50P');
    expect(p51.value).toBeCloseTo(5.0,  2);   // 51P1P=5.00 in DEMO_SEL351
    expect(p50.value).toBeCloseTo(20.0, 2);   // 50P1P=20.00 in DEMO_SEL351
    expect(p51.isDefault).toBe(false);
    expect(p50.isDefault).toBe(false);
  });
});

// ─── renderAnalogScript ───────────────────────────────────────────────────────

describe('renderAnalogScript — 51P TOC (SEL-351)', () => {
  const tc     = mockTC('51P1TC', 'E');
  let script: string;
  // build once
  script = renderAnalogScript(tc, DEMO_SEL351);

  it('contains INJECT commands (not legacy digital SET)', () => {
    expect(script).toContain('INJECT');
    expect(script).toContain('RAMP');
    expect(script).not.toContain('SET 51P1');
  });

  it('contains PREFAULT for relay settling', () => {
    expect(script).toContain('PREFAULT');
  });

  it('checks PICKUP and TRIP via CHECK ELEMENT', () => {
    expect(script).toContain('CHECK ELEMENT');
    expect(script).toContain('PICKUP');
    expect(script).toContain('TRIP');
    expect(script).toContain('RESET');
  });

  it('includes CHECK TIMING with WITHIN for operate time verification', () => {
    expect(script).toContain('CHECK TIMING');
    expect(script).toContain('WITHIN');
  });

  it('embeds pickup value from settings in header', () => {
    // 51P1P=5.00 in DEMO_SEL351
    expect(script).toContain('5.00');
  });

  it('includes relay tag and source file in header', () => {
    expect(script).toContain('FDR01');
    expect(script).toContain('SEL-351');
    expect(script).toContain('SEL351_FDR01.txt');
  });

  it('starts with INIT and ends with END', () => {
    expect(script).toContain('INIT');
    expect(script.trimEnd()).toMatch(/END\n?$/);
  });
});

describe('renderAnalogScript — 50P IOC with PULSE_RAMP (SEL-351)', () => {
  it('selects PULSE_RAMP because SEL-351 has both 50P and 51P settings', () => {
    const tc     = mockTC('50P1', 'A');
    const script = renderAnalogScript(tc, DEMO_SEL351);
    expect(script).toContain('PULSE_RAMP');
    expect(script).toContain('NOTE: PULSE_RAMP used');
  });
});

describe('renderAnalogScript — 87L differential (SEL-411L)', () => {
  it('uses DIFFERENTIAL method with IA and IB injection', () => {
    const tc     = mockTC('87LCT', 'E');
    const script = renderAnalogScript(tc, DEMO_SEL411L);
    expect(script).toContain('DIFFERENTIAL');
    expect(script).toContain('INJECT IA');
    expect(script).toContain('INJECT IB');
  });

  it('tests through-fault restraint (IB at 180°)', () => {
    const tc     = mockTC('87LCT', 'E');
    const script = renderAnalogScript(tc, DEMO_SEL411L);
    expect(script).toContain('180.0');
    expect(script.toLowerCase()).toContain('restrain');
  });
});

describe('renderAnalogScript — 87T differential restraint (SEL-787)', () => {
  it('includes through-fault restraint block with 180° injection', () => {
    const tc     = mockTC('87T', 'B');
    const script = renderAnalogScript(tc, DEMO_SEL787);
    expect(script).toContain('180.0');
    expect(script.toLowerCase()).toContain('restrain');
    expect(script).toContain('INJECT IB');
  });
});

describe('renderAnalogScript — 21P distance (SEL-421)', () => {
  it('uses IMPEDANCE method with voltage and current injection', () => {
    const tc     = mockTC('21TC', 'E');
    const script = renderAnalogScript(tc, DEMO_SEL421);
    expect(script).toContain('IMPEDANCE');
    expect(script).toContain('INJECT VA');
    expect(script).toContain('INJECT IA');
  });

  it('contains timing check for Zone 1 instantaneous (0–20 ms)', () => {
    const tc     = mockTC('21TC', 'E');
    const script = renderAnalogScript(tc, DEMO_SEL421);
    expect(script).toContain('WITHIN 0 20');
  });
});

describe('renderAnalogScript — 79 recloser (SEL-711)', () => {
  it('checks CONTACT TRIP and CONTACT CLOSE', () => {
    const tc     = mockTC('79CY', 'A');
    const script = renderAnalogScript(tc, DEMO_SEL711);
    expect(script).toContain('CHECK CONTACT TRIP == 1');
    expect(script).toContain('CHECK CONTACT CLOSE == 1');
  });
});

describe('renderAnalogScript — 67P directional (SEL-751)', () => {
  it('injects both forward and reverse fault angles', () => {
    const tc     = mockTC('67PTC', 'E');
    const script = renderAnalogScript(tc, DEMO_SEL751);
    expect(script).toContain('INJECT VA');
    expect(script).toContain('INJECT IA');
    // Reverse fault angle note
    expect(script.toLowerCase()).toContain('reverse');
  });
});

describe('renderAnalogScript — logic-only PAC element (SEL-2411)', () => {
  it('uses SET BINARY for digital injection (not analog INJECT)', () => {
    const tc = mockTC('OUT1', 'A', ['IN1', 'IN2', 'SV1'], [{
      stateNumber: 1,
      description: 'Test',
      steps: [
        { type: 'SET',   signal: 'IN1',  value: 1 },
        { type: 'CHECK', signal: 'OUT1', value: 1 },
      ],
    }]);
    const script = renderAnalogScript(tc, DEMO_SEL2411);
    expect(script).toContain('SET BINARY');
    expect(script).toContain('CHECK CONTACT OUT1 == 1');
  });

  it('notes PAC/logic-only in the script header', () => {
    const tc     = mockTC('SV1S', 'D', [], []);
    const script = renderAnalogScript(tc, DEMO_SEL2411);
    expect(script).toContain('PAC/logic-only');
  });
});

describe('renderAnalogScript — extractTimeDial', () => {
  it('reads 51P1TD from SEL-351 settings', () => {
    const map = buildSettingsMap(DEMO_SEL351);
    const td  = extractTimeDial(map, '51P');
    expect(td.value).toBeCloseTo(0.5, 2);   // 51P1TD=0.50 in DEMO_SEL351
    expect(td.isDefault).toBe(false);
  });
});

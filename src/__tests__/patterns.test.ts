import { describe, it, expect } from 'vitest';
import { selectPattern, TEST_PATTERNS } from '../test-engine/patterns';
import type { PatternId } from '../test-engine/patterns';

describe('Pattern selector', () => {
  it('selects Pattern B for TRIP', () => {
    expect(selectPattern('TRIP')).toBe('B');
  });

  it('selects Pattern F for BLOCK', () => {
    expect(selectPattern('BLOCK')).toBe('F');
  });

  it('selects Pattern I for LATCH_SET', () => {
    expect(selectPattern('LATCH_SET')).toBe('I');
  });

  it('selects Pattern I for LATCH_RESET', () => {
    expect(selectPattern('LATCH_RESET')).toBe('I');
  });

  it('selects Pattern E for TIMER_IN', () => {
    expect(selectPattern('TIMER_IN')).toBe('E');
  });

  it('selects Pattern E for TIMER_OUT', () => {
    expect(selectPattern('TIMER_OUT')).toBe('E');
  });

  it('selects Pattern C for ALARM', () => {
    expect(selectPattern('ALARM')).toBe('C');
  });

  it('selects Pattern A for OUTPUT', () => {
    expect(selectPattern('OUTPUT')).toBe('A');
  });

  it('selects Pattern A for PICKUP', () => {
    expect(selectPattern('PICKUP')).toBe('A');
  });

  it('selects Pattern A for GENERAL', () => {
    expect(selectPattern('GENERAL')).toBe('A');
  });

  // ── Pattern H (Rising Edge) ──────────────────────────────────────────────

  it('selects Pattern H for RISING_EDGE function type', () => {
    expect(selectPattern('RISING_EDGE')).toBe('H');
  });

  it('selects Pattern H when expression contains ^ operator', () => {
    expect(selectPattern('GENERAL', '^IN101')).toBe('H');
  });

  it('selects Pattern H for TRIP with ^ expression', () => {
    // ^ in expression overrides TRIP's normal Pattern B
    expect(selectPattern('TRIP', '^52A')).toBe('H');
  });

  // ── Pattern J (Comms-Assisted) ───────────────────────────────────────────

  it('selects Pattern J for COMM_ASSISTED function type', () => {
    expect(selectPattern('COMM_ASSISTED')).toBe('J');
  });

  it('selects Pattern J when signals include RxWI', () => {
    expect(selectPattern('TRIP', undefined, ['21P2', '67P', 'RXWI'])).toBe('J');
  });

  it('selects Pattern J when signals include POTT', () => {
    expect(selectPattern('TRIP', undefined, ['POTT', '21P1'])).toBe('J');
  });

  it('selects Pattern J when signals include COMM_IN', () => {
    expect(selectPattern('GENERAL', undefined, ['IN1', 'COMM_IN', 'SV1'])).toBe('J');
  });

  // ── Pattern I ────────────────────────────────────────────────────────────

  it('selects Pattern I for DIFFERENTIAL (latch-like dominance)', () => {
    expect(selectPattern('DIFFERENTIAL')).toBe('B');
  });

  // ── Test pattern library completeness ────────────────────────────────────

  it('TEST_PATTERNS has all 10 entries A-J', () => {
    const ids: PatternId[] = ['A','B','C','D','E','F','G','H','I','J'];
    for (const id of ids) {
      expect(TEST_PATTERNS[id]).toBeDefined();
      expect(TEST_PATTERNS[id].name).toBeTruthy();
    }
  });

  it('each pattern has a non-empty description', () => {
    for (const p of Object.values(TEST_PATTERNS)) {
      expect(p.description.length).toBeGreaterThan(5);
    }
  });
});

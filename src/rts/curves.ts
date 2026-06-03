/**
 * @module rts/curves
 * Named curve types and operate-time formula for time-overcurrent (51) elements.
 *
 * Formula:  t = TD × K / (M^α − 1)  [result in milliseconds]
 * DT:       t = TD × 1000 ms  (time dial is already in seconds)
 *
 * These are the simplified IEC/IEEE forms without additive correction constants,
 * giving a precise theoretical value directly verifiable against the formula.
 */

// ─── Curve type ───────────────────────────────────────────────────────────────

/** Named curve types supported by the constant-injection 51-element renderer. */
export type CurveType =
  | 'MI'      // IEEE Moderately Inverse   (U1)  K=0.0515, α=0.02
  | 'VI'      // IEEE Very Inverse         (U2)  K=19.61,  α=2.0
  | 'EI'      // IEEE Extremely Inverse    (U3)  K=28.2,   α=2.0
  | 'SI'      // IEC Standard Inverse      (C1)  K=0.14,   α=0.02
  | 'IEC_VI'  // IEC Very Inverse          (C2)  K=13.5,   α=1.0
  | 'IEC_EI'  // IEC Extremely Inverse     (C3)  K=80.0,   α=2.0
  | 'DT';     // Definite Time             (DEF) t = TD seconds

// ─── SEL code → CurveType mapping ────────────────────────────────────────────

/**
 * Map a SEL relay curve code (U1–U5, C1–C5, DEF/DT) to a named CurveType.
 *
 * Only the curves that have a direct CurveType equivalent are mapped precisely;
 * U5, C4, C5 are not in the user-facing named set and fall back to 'MI'.
 *
 * U4 = IEEE Short-Time Inverse — SEL implements it with the same K=28.2, α=2.0
 * constants as U3 (Extremely Inverse), so it maps to 'EI'.  See SEL-351S
 * Instruction Manual §4 "Overcurrent Elements" curve table.
 */
export function selCodeToCurveType(code: string): CurveType {
  switch (code.toUpperCase().trim()) {
    case 'U1': return 'MI';
    case 'U2': return 'VI';
    case 'U3': return 'EI';
    case 'U4': return 'EI';  // IEEE Short-Time Inverse (same formula as EI on SEL-351S)
    case 'C1': return 'SI';
    case 'C2': return 'IEC_VI';
    case 'C3': return 'IEC_EI';
    case 'DEF':
    case 'DT':  return 'DT';
    default:    return 'MI';   // U5, C4, C5, unknown → moderately inverse
  }
}

// ─── Operate-time formula ─────────────────────────────────────────────────────

/**
 * Compute TOC operate time in **milliseconds**.
 *
 * Uses: t = TD × K / (M^α − 1) × 1000
 * (No additive correction constants — pure formula value for direct verification.)
 *
 * @param curve  Named curve type
 * @param TD     Time dial setting (dimensionless for IEEE/IEC; seconds for DT)
 * @param M      Current multiple of pickup — must be strictly > 1.0
 * @returns      Operate time in milliseconds
 * @throws       Error if M ≤ 1.0
 */
export function computeOperateTimeMs(
  curve: CurveType,
  TD: number,
  M: number,
): number {
  if (M <= 1.0) throw new Error(`M must be > 1.0 (current must exceed pickup); got M=${M}`);

  switch (curve) {
    case 'MI':     return TD * 0.0515 / (Math.pow(M, 0.02) - 1) * 1000;
    case 'VI':     return TD * 19.61  / (Math.pow(M, 2.0)  - 1) * 1000;
    case 'EI':     return TD * 28.2   / (Math.pow(M, 2.0)  - 1) * 1000;
    case 'SI':     return TD * 0.14   / (Math.pow(M, 0.02) - 1) * 1000;
    case 'IEC_VI': return TD * 13.5   / (Math.pow(M, 1.0)  - 1) * 1000;
    case 'IEC_EI': return TD * 80.0   / (Math.pow(M, 2.0)  - 1) * 1000;
    case 'DT':     return TD * 1000;
    default:       return TD * 0.0515 / (Math.pow(M, 0.02) - 1) * 1000; // fallback MI
  }
}

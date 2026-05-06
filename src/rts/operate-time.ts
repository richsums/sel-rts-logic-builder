/**
 * @module rts/operate-time
 * IEEE and IEC time-overcurrent (TOC) curve formulas.
 *
 * All functions return operate time in SECONDS for a given curve type,
 * time-dial setting (TD), and current multiple M = I / I_pickup.
 *
 * Returns Infinity when M ≤ 1.0 (element will not operate below pickup).
 */

// ─── Core formula ─────────────────────────────────────────────────────────────

/**
 * Compute TOC operate time in seconds.
 *
 * @param curve  SEL curve code (U1–U5, C1–C5, DEF/DT) or synonyms
 * @param TD     Time dial setting (dimensionless for IEEE/IEC; seconds for DEF)
 * @param M      Current multiple of pickup: M = I / Ipickup  (must be > 1)
 * @returns      Operate time in seconds, or Infinity if M ≤ 1
 */
export function computeOperateTime(curve: string, TD: number, M: number): number {
  if (M <= 1.0) return Infinity;

  switch (curve.toUpperCase().trim()) {
    // ── IEEE curves (SEL U1–U5) ────────────────────────────────────────────
    case 'U1':
      // IEEE Moderately Inverse (most common default)
      return TD * (0.0515 / (Math.pow(M, 0.02) - 1) + 0.1140);

    case 'U2':
      // IEEE Very Inverse
      return TD * (19.61 / (M * M - 1) + 0.491);

    case 'U3':
      // IEEE Extremely Inverse
      return TD * (28.2 / (M * M - 1) + 0.1217);

    case 'U4':
      // IEEE Short-Time Inverse
      return TD * (0.0964 / (Math.pow(M, 0.02) - 1));

    case 'U5':
      // IEEE Long-Time Inverse
      return TD * (5.64 / (M * M - 1));

    // ── IEC curves (SEL C1–C5) ─────────────────────────────────────────────
    case 'C1':
      // IEC Class A — Standard Inverse
      return TD * (0.14 / (Math.pow(M, 0.02) - 1));

    case 'C2':
      // IEC Class B — Very Inverse
      return TD * (13.5 / (M - 1));

    case 'C3':
      // IEC Class C — Extremely Inverse
      return TD * (80.0 / (M * M - 1));

    case 'C4':
      // IEC Long-Time Standby (earth fault)
      return TD * (120.0 / (M - 1));

    case 'C5':
      // IEC Long-Time Inverse
      return TD * (12.0 / (M - 1));

    // ── Definite-time ──────────────────────────────────────────────────────
    case 'DEF':
    case 'DT':
      // TD is the operate time in seconds directly
      return TD;

    default:
      // Unknown curve — fall back to U1 (IEEE Moderately Inverse)
      return TD * (0.0515 / (Math.pow(M, 0.02) - 1) + 0.1140);
  }
}

/**
 * Convenience wrapper — returns operate time in milliseconds.
 * Returns Infinity if M ≤ 1.0.
 */
export function computeOperateTimeMs(curve: string, TD: number, M: number): number {
  const t = computeOperateTime(curve, TD, M);
  return isFinite(t) ? t * 1000 : Infinity;
}

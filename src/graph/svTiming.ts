/**
 * @module graph/svTiming
 * Helpers for SEL SELOGIC variable/timer (SV) naming.
 *
 * SEL model: `SVn = <expr>` (instantaneous SELOGIC result) is delayed by the
 * pickup (`SVnPU`) and dropout (`SVnDO`) timers to produce the timed word bit
 * `SVnT`, which is what downstream logic references. We surface that chain on the
 * graph so the SV's upstream logic connects to the `SVnT` bit it asserts.
 */

/** True for the raw SV bit, e.g. "SV2". */
export function isSvBit(id: string): boolean {
  return /^SV\d+$/i.test(id);
}

/** True for the timed SV word bit, e.g. "SV2T". */
export function isSvTimedBit(id: string): boolean {
  return /^SV\d+T$/i.test(id);
}

/** "SV2T" → "SV2"; null if not a timed SV bit. */
export function svBaseOf(id: string): string | null {
  const m = id.match(/^SV(\d+)T$/i);
  return m ? `SV${m[1]}` : null;
}

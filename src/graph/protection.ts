/**
 * @module graph/protection
 * Utilities for SEL relay protection element naming conventions.
 *
 * SEL relays use a two-stage model for every protection element:
 *   - Pickup bit  (P suffix): asserts when measured quantity exceeds threshold
 *   - Trip word bit (T suffix): asserts after all time-delay prerequisites are satisfied
 *
 * Examples:
 *   50P1P → pickup for phase inst OC element 1
 *   50P1T → trip word bit for phase inst OC element 1
 *   51P1P → pickup for phase TOC element 1
 *   51P1T → trip word bit for phase TOC element 1
 *   79P   → recloser pickup
 *   79T   → recloser trip word bit
 */

// ─── Prefix pattern ───────────────────────────────────────────────────────────

/**
 * Matches the prefix of any SEL protection element identifier.
 * Covers: 50*, 51*, 21*, 87*, 67*, 79*, SEF*, Z<digit>*
 */
export const PROTECTION_PREFIX_RE = /^(50|51|21|87|67|79|SEF|Z\d)/i;

// ─── Naming convention utilities ──────────────────────────────────────────────

/**
 * Given a pickup bit ID (ending in 'P'), return the corresponding trip word bit (ending in 'T').
 * If the ID does not end in 'P', it is returned unchanged.
 *
 * Examples:
 *   '50P1P'  → '50P1T'
 *   '51G1P'  → '51G1T'
 *   '21P1P'  → '21P1T'
 *   '67P1P'  → '67P1T'
 *   '87L1P'  → '87L1T'
 *   '87T1P'  → '87T1T'
 *   '79P'    → '79T'
 */
export function resolveTripWordBit(pickupId: string): string {
  if (!pickupId.endsWith('P')) return pickupId;
  return pickupId.slice(0, -1) + 'T';
}

/**
 * Given a trip word bit ID (ending in 'T'), return the corresponding pickup bit (ending in 'P').
 * If the ID does not end in 'T', it is returned unchanged.
 *
 * Examples:
 *   '50P1T'  → '50P1P'
 *   '51G1T'  → '51G1P'
 *   '79T'    → '79P'
 */
export function resolvePickupBit(tripWordBitId: string): string {
  if (!tripWordBitId.endsWith('T')) return tripWordBitId;
  return tripWordBitId.slice(0, -1) + 'P';
}

/**
 * Returns true if the ID looks like a protection element pickup bit —
 * matches a protection element prefix AND ends with 'P'.
 *
 * Examples returning true:  '50P1P', '51G1P', '21P1P', '79P'
 * Examples returning false: 'TR', '52A', 'IN101', '50P1T'
 */
export function isPickupBit(id: string): boolean {
  return id.endsWith('P') && PROTECTION_PREFIX_RE.test(id);
}

/**
 * Returns true if the ID looks like a protection element trip word bit —
 * matches a protection element prefix AND ends with 'T'.
 *
 * Examples returning true:  '50P1T', '51G1T', '87LT', '79T'
 * Examples returning false: 'TR', 'TRIP', '51P1P', 'TD1', '87T' (element name)
 *
 * Special case: 87x elements always have a mandatory subtype letter (87L = line
 * differential, 87T = transformer differential).  The element name '87T' is
 * 3 characters; a trip word bit would be '87TT' or '87T1T' (4+ chars).
 */
export function isTripWordBit(id: string): boolean {
  if (!id.endsWith('T')) return false;
  if (!PROTECTION_PREFIX_RE.test(id)) return false;
  // Exclude bare 87x element names (87L, 87T) which are 3 chars total
  if (/^87/i.test(id) && id.length === 3) return false;
  return true;
}

/**
 * Strip the trailing 'P' or 'T' suffix to get the element base identifier.
 * Used to match a pickup bit to its trip word bit and vice versa.
 *
 * Examples:
 *   '50P1P'  → '50P1'
 *   '50P1T'  → '50P1'
 *   '51G1P'  → '51G1'
 *   '79P'    → '79'
 *   '79T'    → '79'
 */
export function elementBase(id: string): string {
  if ((id.endsWith('P') || id.endsWith('T')) && PROTECTION_PREFIX_RE.test(id)) {
    return id.slice(0, -1);
  }
  return id;
}

// ─── Timer presence heuristics ────────────────────────────────────────────────

/**
 * Returns true for instantaneous elements (50x) that assert without a timer.
 * These have no time-delay: pickup → trip word bit is immediate.
 */
export function isInstantaneous(id: string): boolean {
  return /^50/i.test(id);
}

/**
 * Returns true for time-overcurrent elements (51x, 67x) that use a
 * time-inverse operate-time formula and always have a timer.
 */
export function isTimeOvercurrent(id: string): boolean {
  return /^(51|67)/i.test(id);
}

/**
 * Returns true for distance elements (21x) that use a definite-time delay.
 */
export function isDistance(id: string): boolean {
  return /^21/i.test(id);
}

/**
 * Returns true for differential elements (87x).
 */
export function isDifferential(id: string): boolean {
  return /^87/i.test(id);
}

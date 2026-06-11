/**
 * @module rts/settings-extractor
 * Utilities for pulling protection-element setting values (pickup, time dial,
 * curve type, voltages) out of the flat key→value pairs in ParsedRelaySettings.
 */

import type { ParsedRelaySettings } from '../relay-adapters/common/types';

// ─── Core types ───────────────────────────────────────────────────────────────

export type SettingsMap = Map<string, string>;

/** Build a flattened key→value map from all setting groups on a relay. */
export function buildSettingsMap(relay: ParsedRelaySettings): SettingsMap {
  const map = new Map<string, string>();
  for (const group of relay.settingGroups) {
    for (const entry of group.entries) {
      map.set(entry.key.toUpperCase().trim(), entry.value.trim());
    }
  }
  return map;
}

/** Read a numeric value (float) from the map, returning `defaultVal` if absent. */
export function getFloat(map: SettingsMap, key: string, defaultVal: number): number {
  const v = map.get(key.toUpperCase().trim());
  if (v === undefined) return defaultVal;
  const n = parseFloat(v);
  return isNaN(n) ? defaultVal : n;
}

/** Read a string value from the map, returning `defaultVal` if absent. */
export function getString(map: SettingsMap, key: string, defaultVal: string): string {
  return map.get(key.toUpperCase().trim()) ?? defaultVal;
}

// ─── Candidate key tables ─────────────────────────────────────────────────────

/**
 * Ordered list of setting keys to try for the pickup of each protection element.
 * Keys are listed from most specific to least specific.
 */
const PICKUP_KEYS: Record<string, string[]> = {
  '51P': ['51P1P', '51PPU', '51P1PU', '51PP'],
  '51G': ['51G1P', '51GPU', '51G1PU', '51GP'],
  '51N': ['51N1P', '51NPU', '51N1PU', '51NP'],
  '50P': ['50P1P', '50PPU', '50P1PU', '50P1', '50PP'],
  '50G': ['50G1P', '50GPU', '50G1PU', '50G1', '50GP'],
  '50N': ['50N1P', '50NPU', '50N1PU', '50N1'],
  '21P': ['21P1R', '21P1MAG', 'Z1MAG', 'Z1P'],
  '21G': ['21G1R', 'Z1GMAG', 'Z1G'],
  '87L': ['87LP', '87LPU', '87L_PKP', '87LPKP'],
  '87T': ['87TP', '87TPU', '87T_PKP', '87TPKP'],
  '67P': ['67PPU', '67P1P', '67PPK', '67PP'],
  '67G': ['67GPU', '67G1P', '67GPK', '67GP'],
  'SEF': ['SEFPU', 'SEFP', 'SEF_PU'],
};

/** Ordered list of setting keys to try for the time dial of each element. */
const TD_KEYS: Record<string, string[]> = {
  '51P': ['51P1TD', '51PTD'],
  '51G': ['51G1TD', '51GTD'],
  '51N': ['51N1TD', '51NTD'],
  '67P': ['67PTD', '67P1TD'],
  '67G': ['67GTD', '67G1TD'],
  'SEF': ['SEFTD', 'SEF_TD'],
};

/** Default pickup values (secondary amps, or Ω for distance). */
const DEFAULT_PICKUP: Record<string, number> = {
  '51P': 5.0,  '51G': 1.0,  '51N': 1.0,
  '50P': 20.0, '50G': 5.0,  '50N': 5.0,
  '21P': 4.0,  '21G': 4.0,
  '87L': 0.2,  '87T': 0.3,
  '67P': 4.0,  '67G': 1.0,
  'SEF': 0.1,
};

/**
 * Ordered list of setting keys to try for the curve type.
 * NOTE: SEL-351 curve keys are `51P1C` / `51G1C`. The `…CT` form is NOT used
 * here — on the SEL-351, `51P1CT` is the constant-time ADDER setting and would
 * be misread as a curve code (e.g. "0.00").
 */
const CURVE_KEYS: Record<string, string[]> = {
  '51P': ['51P1C', '51PC'],
  '51G': ['51G1C', '51GC'],
  '51N': ['51N1C', '51NC'],
  '67P': ['67PC'],
  '67G': ['67GC'],
};

// ─── Extraction helpers ───────────────────────────────────────────────────────

/**
 * Strip trailing digits from an element label to get the base element type.
 * e.g. '51P1' → '51P', '50G2' → '50G', '87L' → '87L'
 */
function baseElement(label: string): string {
  return label.toUpperCase().replace(/\d+$/, '');
}

/**
 * Strip a trailing word-bit suffix (T = timed out, R = reset) from an element
 * instance id, e.g. '51P1T' → '51P1', '67G2T' → '67G2'. Leaves bare element
 * names ('87T', '51P') untouched.
 */
function stripWordBitSuffix(element: string): string {
  const u = element.toUpperCase();
  const m = u.match(/^(\d{2}[PNGQ]\d*)(T|R|TC)$/);
  return m ? m[1] : u;
}

/**
 * SEL-351-family direct setting keys for a full element instance id.
 * 51P1 → pickup 51P1P / TD 51P1TD / curve 51P1C
 * 67G2 → pickup 50G2P (67 elements share the 50-series threshold settings)
 * 50G2 → pickup 50G2P
 */
function directKeys(element: string): { pickup: string[]; td: string[]; curve: string[] } {
  const e = stripWordBitSuffix(element);
  let m = e.match(/^51([PNGQ])(\d+)$/);
  if (m) {
    const base = `51${m[1]}${m[2]}`;
    return { pickup: [`${base}P`], td: [`${base}TD`], curve: [`${base}C`] };
  }
  m = e.match(/^67([PNGQ])(\d+)$/);
  if (m) {
    return { pickup: [`50${m[1]}${m[2]}P`, `67${m[1]}${m[2]}P`], td: [], curve: [] };
  }
  m = e.match(/^50([PNGQ])(\d+)$/);
  if (m) {
    return { pickup: [`${e}P`], td: [], curve: [] };
  }
  return { pickup: [], td: [], curve: [] };
}

function tryNumericKeys(
  map: SettingsMap,
  keys: string[],
): { value: number; key: string } | null {
  for (const key of keys) {
    const raw = map.get(key.toUpperCase());
    // "OFF" means the element is disabled — keep searching / fall to default.
    if (raw !== undefined && !/^OFF$/i.test(raw.trim())) {
      const n = parseFloat(raw);
      if (!isNaN(n)) return { value: n, key };
    }
  }
  return null;
}

/**
 * Extract the pickup setting for a protection element.
 * Accepts bare elements ('51P'), instances ('51P1') and word bits ('51P1T').
 * @param map     Flat settings map built by buildSettingsMap()
 * @returns       Pickup value (A secondary, or Ω for distance), the key found, and whether a default was used
 */
export function extractPickupSetting(
  map: SettingsMap,
  element: string,
): { value: number; key: string; isDefault: boolean } {
  const elem = baseElement(stripWordBitSuffix(element));
  const hit = tryNumericKeys(map, [...directKeys(element).pickup, ...(PICKUP_KEYS[elem] ?? [])]);
  if (hit) return { ...hit, isDefault: false };
  const defaultVal = DEFAULT_PICKUP[elem] ?? 1.0;
  return { value: defaultVal, key: '(default)', isDefault: true };
}

/**
 * Extract the time dial setting for a TOC element.
 * @returns  Time dial value, the key found, and whether a default was used
 */
export function extractTimeDial(
  map: SettingsMap,
  element: string,
): { value: number; key: string; isDefault: boolean } {
  const elem = baseElement(stripWordBitSuffix(element));
  const hit = tryNumericKeys(map, [...directKeys(element).td, ...(TD_KEYS[elem] ?? [])]);
  if (hit) return { ...hit, isDefault: false };
  return { value: 1.0, key: '(default)', isDefault: true };
}

/**
 * Extract the curve type string for a TOC element.
 * Returns 'U1' (IEEE Moderately Inverse) if not found.
 */
export function extractCurveType(map: SettingsMap, element: string): string {
  const elem = baseElement(stripWordBitSuffix(element));
  for (const key of [...directKeys(element).curve, ...(CURVE_KEYS[elem] ?? [])]) {
    const raw = map.get(key.toUpperCase());
    if (raw !== undefined) return raw.toUpperCase().trim();
  }
  return 'U1';
}

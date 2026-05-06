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

/** Ordered list of setting keys to try for the curve type. */
const CURVE_KEYS: Record<string, string[]> = {
  '51P': ['51P1CT', '51PCT'],
  '51G': ['51G1CT', '51GCT'],
  '51N': ['51N1CT', '51NCT'],
  '67P': ['67PCT'],
  '67G': ['67GCT'],
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
 * Extract the pickup setting for a protection element.
 * @param map     Flat settings map built by buildSettingsMap()
 * @param element Element identifier (e.g. '51P', '50P1', '87L')
 * @returns       Pickup value (A secondary, or Ω for distance), the key found, and whether a default was used
 */
export function extractPickupSetting(
  map: SettingsMap,
  element: string,
): { value: number; key: string; isDefault: boolean } {
  const elem = baseElement(element);
  for (const key of PICKUP_KEYS[elem] ?? []) {
    const raw = map.get(key.toUpperCase());
    if (raw !== undefined) {
      const n = parseFloat(raw);
      if (!isNaN(n)) return { value: n, key, isDefault: false };
    }
  }
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
  const elem = baseElement(element);
  for (const key of TD_KEYS[elem] ?? []) {
    const raw = map.get(key.toUpperCase());
    if (raw !== undefined) {
      const n = parseFloat(raw);
      if (!isNaN(n)) return { value: n, key, isDefault: false };
    }
  }
  return { value: 1.0, key: '(default)', isDefault: true };
}

/**
 * Extract the curve type string for a TOC element.
 * Returns 'U1' (IEEE Moderately Inverse) if not found.
 */
export function extractCurveType(map: SettingsMap, element: string): string {
  const elem = baseElement(element);
  for (const key of CURVE_KEYS[elem] ?? []) {
    const raw = map.get(key.toUpperCase());
    if (raw !== undefined) return raw.toUpperCase().trim();
  }
  return 'U1';
}

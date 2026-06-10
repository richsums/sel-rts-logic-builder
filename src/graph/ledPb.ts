/**
 * @module graph/ledPb
 * Best-effort extraction of ENABLED front-panel LEDs and pushbuttons (PBs) from
 * parsed relay settings, used to build optional LED/PB logic areas.
 *
 * NOTE: SEL models express LEDs/PBs differently across firmware (e.g. `LEDn`,
 * `TLEDn` SELOGIC target equations; `PBn` local-control pushbuttons). The demo
 * fixtures contain none, so these patterns are written from common SEL
 * conventions and are CENTRALIZED HERE so they can be tuned against a real
 * settings file without touching the rest of the graph pipeline.
 */

import type { ParsedRelaySettings } from '../relay-adapters/common/types';

export interface LedPbItem {
  /** Signal id, e.g. "LED3" or "PB1". */
  id: string;
  /** Driving SELOGIC expression (what asserts the LED / PB target). */
  expression: string;
  /** Optional human note (the setting description / label). */
  note?: string;
}

// A value counts as "disabled / unassigned" when it's blank or an off-sentinel.
const DISABLED_RE = /^\s*(|NA|N\/A|OFF|0|N|NONE)\s*$/i;

function isEnabled(value: string): boolean {
  return !DISABLED_RE.test(value ?? '');
}

/** Pull every (key, value, note) pair from settings groups + logic equations. */
function allAssignments(
  relay: ParsedRelaySettings | null,
): Array<{ key: string; value: string; note?: string }> {
  if (!relay) return [];
  const out: Array<{ key: string; value: string; note?: string }> = [];
  for (const group of relay.settingGroups) {
    for (const e of group.entries) out.push({ key: e.key, value: e.value });
  }
  for (const eq of relay.logicEquations) {
    out.push({ key: eq.label, value: eq.expression, note: eq.description });
  }
  return out;
}

/**
 * Enabled programmable LEDs. Matches `LEDn` / `TLEDn` target equations with a
 * real driving expression.
 */
export function extractEnabledLeds(relay: ParsedRelaySettings | null): LedPbItem[] {
  const seen = new Set<string>();
  const items: LedPbItem[] = [];
  for (const { key, value, note } of allAssignments(relay)) {
    const m = key.match(/^T?LED(\d+)$/i);
    if (!m) continue;
    const id = key.toUpperCase().replace(/^T/, ''); // normalize TLED3 → LED3
    if (seen.has(id)) continue;
    if (!isEnabled(value)) continue;
    seen.add(id);
    items.push({ id, expression: value, note });
  }
  return items.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/**
 * Enabled front-panel pushbuttons. Matches `PBn` (and labelled variants like
 * `PBnT`) that carry an assigned SELOGIC expression / label.
 */
export function extractEnabledPushbuttons(relay: ParsedRelaySettings | null): LedPbItem[] {
  const seen = new Set<string>();
  const items: LedPbItem[] = [];
  for (const { key, value, note } of allAssignments(relay)) {
    const m = key.match(/^PB(\d+)$/i);
    if (!m) continue;
    const id = key.toUpperCase();
    if (seen.has(id)) continue;
    if (!isEnabled(value)) continue;
    seen.add(id);
    items.push({ id, expression: value, note });
  }
  return items.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

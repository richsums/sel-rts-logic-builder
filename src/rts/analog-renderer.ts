/**
 * @module rts/analog-renderer
 * Generates physically meaningful ENOSERV RTS scripts using analog injection.
 *
 * Command vocabulary produced:
 *   INJECT IA/IB/IC/VA/VB/VC/IN [magnitude] [angle_deg]
 *   RAMP IA/IN FROM [start] TO [end] IN [ms]
 *   PULSE_RAMP IA/IN FROM [start] TO [end] IN [ms]
 *   PREFAULT [ms]
 *   WAIT [ms]
 *   CHECK ELEMENT [name] == PICKUP | TRIP | RESET
 *   CHECK CONTACT [bit] == 0 | 1
 *   CHECK TIMING [element] WITHIN [min_ms] [max_ms]
 *   SET BINARY [signal] [0|1]   (logic-only elements)
 */

import type { GeneratedTestCase } from '../test-engine/generator';
import type { ParsedRelaySettings } from '../relay-adapters/common/types';
import {
  buildSettingsMap,
  type SettingsMap,
  extractPickupSetting,
  extractTimeDial,
  extractCurveType,
  getFloat,
} from './settings-extractor';
import { computeOperateTimeMs as computeTOCMs, selCodeToCurveType } from './curves';
import { isComputedOutput } from './renderer';

// ─── Protection function classifier ──────────────────────────────────────────

export type ProtectionFunction =
  | '51P' | '51G' | '51N'
  | '50P' | '50G' | '50N'
  | '21P' | '21G'
  | '87L' | '87T'
  | '67P' | '67G'
  | '79'
  | 'SEF'
  | 'LOGIC';

export type InjectionMethod = 'RAMP' | 'PULSE_RAMP' | 'IMPEDANCE' | 'DIFFERENTIAL' | 'DIGITAL' | 'CONSTANT';

/**
 * Classify a protection element from its label (and optionally expression/signals).
 * Returns the protection function type, or 'LOGIC' for non-protection elements.
 */
export function classifyElement(
  label: string,
  expression?: string,
): ProtectionFunction {
  const u = label.toUpperCase().trim();

  // Primary element label patterns
  if (/^51P/.test(u)) return '51P';
  if (/^51G/.test(u)) return '51G';
  if (/^51N/.test(u)) return '51N';
  if (/^50P/.test(u)) return '50P';
  if (/^50G/.test(u)) return '50G';
  if (/^50N/.test(u)) return '50N';
  if (/^21P/.test(u) || /^Z1P/.test(u)) return '21P';
  if (/^21G/.test(u) || /^Z1G/.test(u)) return '21G';
  if (/^87L/.test(u)) return '87L';
  if (/^87T/.test(u)) return '87T';
  if (/^67P/.test(u)) return '67P';
  if (/^67G/.test(u)) return '67G';
  if (/^79/.test(u)) return '79';
  if (/^SEF/.test(u)) return 'SEF';

  // Trip / POTT outputs — derive from expression
  if (u === 'TR' || u === 'TRIP' || u === 'POTT' || u === 'PUTT') {
    const exp = (expression ?? '').toUpperCase();
    if (/87L/.test(exp)) return '87L';
    if (/87T/.test(exp)) return '87T';
    if (/21P|21G|Z1|Z2|Z3/.test(exp)) return '21P';
    if (/67P|67G/.test(exp)) return '67P';
    if (/51P|51G|51N/.test(exp)) return '51P';
  }

  // Timer-control labels that embed the element name
  if (/51P1TC|51PTC/.test(u)) return '51P';
  if (/51G1TC|51GTC/.test(u)) return '51G';
  if (/51NTC/.test(u))         return '51N';
  if (/67PTC|67P1TC/.test(u)) return '67P';
  if (/67GTC|67G1TC/.test(u)) return '67G';
  if (/87LCT/.test(u))         return '87L';
  if (/21TC/.test(u))          return '21P';
  if (/REF_TRIP|REFT/.test(u)) return '87T';
  if (/SEF_TRIP/.test(u))      return 'SEF';

  return 'LOGIC';
}

/**
 * Select the injection method for a given element label and settings map.
 * Returns PULSE_RAMP for 50P/50G/50N when 51P is also present (prevents
 * the TOC element timing out before the IOC threshold is reached).
 */
export function selectInjectionProfile(
  element: string,
  map: SettingsMap,
): InjectionMethod {
  const protFn = classifyElement(element);

  switch (protFn) {
    case '50P':
    case '50G':
    case '50N': {
      // Need fast ramp if a time-overcurrent element is also present
      const has51 =
        map.has('51P1P') || map.has('51PPU') || map.has('51PP') ||
        map.has('51P1PU') || map.has('51GPU') || map.has('51G1P');
      return has51 ? 'PULSE_RAMP' : 'RAMP';
    }
    case '21P':
    case '21G':
      return 'IMPEDANCE';
    case '87L':
    case '87T':
      return 'DIFFERENTIAL';
    case '51P':
    case '51G':
    case '51N':
    case '67P':
    case '67G':
    case 'SEF':
    case '79':
      return 'RAMP';
    default:
      return 'DIGITAL';
  }
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmt(n: number, dp = 2): string { return n.toFixed(dp); }

function buildHeader(
  label: string,
  relay: ParsedRelaySettings,
  sourceLines: number[],
  pattern: string,
  element: string,
  method: InjectionMethod,
  extra: string[],
): string {
  return [
    `* ============================================================`,
    `* Script:  ${relay.tag} / ${label} / Pattern ${pattern}`,
    `* Relay:   ${relay.model} | Tag: ${relay.tag}`,
    `* Source:  ${relay.sourceFile} line ${sourceLines[0] ?? 0}`,
    `* Protection Function: ${element}`,
    `* Test Pattern: ${pattern}`,
    `* Injection Method: ${method}`,
    ...extra,
    `* Generated: ${new Date().toISOString().slice(0, 16)}`,
    `* ============================================================`,
  ].join('\n');
}

function buildScript(
  label: string,
  relay: ParsedRelaySettings,
  sourceLines: number[],
  pattern: string,
  element: string,
  method: InjectionMethod,
  extra: string[],
  body: string[],
): string {
  const header = buildHeader(label, relay, sourceLines, pattern, element, method, extra);
  return `${header}\nINIT\n${body.join('\n')}\nEND\n`;
}

// ─── Injection profile builders ───────────────────────────────────────────────

/**
 * Time Overcurrent (51P, 51G, 51N, SEF) — constant current at M× pickup.
 *
 * Replaces the former RAMP approach. A fixed current multiple gives a precisely
 * calculable operate time directly verifiable against the curve formula:
 *   t = TD × K / (M^α − 1) ms
 *
 * @param M  Current multiple of pickup (2, 3, or 4)
 */
function buildTOCConstantScript(
  element: string,
  map: SettingsMap,
  relay: ParsedRelaySettings,
  label: string,
  sourceLines: number[],
  pattern: string,
  M: number,
): string {
  const pickup   = extractPickupSetting(map, element);
  const td       = extractTimeDial(map, element);
  const selCurve = extractCurveType(map, element);
  const curve    = selCodeToCurveType(selCurve);
  const vnom     = getFloat(map, 'VNOM', 67.0);
  const pu       = pickup.value;

  const testCurrentA = pu * M;
  const operateMs    = Math.round(computeTOCMs(curve, td.value, M));
  const minMs        = Math.round(operateMs * 0.95);
  const maxMs        = Math.round(operateMs * 1.05);
  const waitMs       = Math.round(operateMs * 1.1) + 100;

  // Neutral channel for ground/SEF elements
  const isGround = element === '51G' || element === '51N' || element === 'SEF';
  const ch       = isGround ? 'IN' : 'IA';

  const puNote = pickup.isDefault
    ? ` (default — ${pickup.key} not found in settings)`
    : ` (from ${pickup.key})`;
  const tdNote = td.isDefault
    ? ` (default — ${td.key} not found)`
    : ` (from ${td.key})`;

  return buildScript(label, relay, sourceLines, pattern, element, 'CONSTANT', [
    `* Pickup Setting:   ${fmt(pu)} A secondary${puNote}`,
    `* Time Dial:        ${fmt(td.value)}${tdNote}`,
    `* Curve:            ${selCurve} (${curve})`,
    `* Test Multiple:    ${M}× pickup`,
    `* Test Current:     ${fmt(testCurrentA)} A secondary`,
    `* Expected Operate Time: ${operateMs} ms ± 5% (${minMs}–${maxMs} ms)`,
    `*   (t = TD × K / (M^α − 1); curve=${curve}, TD=${fmt(td.value)}, M=${M})`,
  ], [
    `  STATE 1`,
    `    * Prefault initialisation — relay settling`,
    `    INJECT ${ch} 0.00 0.0`,
    `    INJECT VA ${fmt(vnom)} 0.0`,
    `    INJECT VB ${fmt(vnom)} -120.0`,
    `    INJECT VC ${fmt(vnom)} 120.0`,
    `    PREFAULT 500`,
    `    WAIT 200`,
    ``,
    `  STATE 2 — Apply constant fault current at ${M}× pickup`,
    `    INJECT ${ch} ${fmt(testCurrentA)} 0.0`,
    `    WAIT 100`,
    `    CHECK ELEMENT ${label} == PICKUP`,
    ``,
    `  STATE 3 — Wait for timer to operate`,
    `    WAIT ${waitMs}`,
    ``,
    `  STATE 4 — Verify trip`,
    `    CHECK ELEMENT ${label} == TRIP`,
    `    CHECK TIMING ${label} WITHIN ${minMs} ${maxMs}`,
    ``,
    `  STATE 5 — Remove current, verify reset`,
    `    INJECT ${ch} 0.00 0.0`,
    `    WAIT 200`,
    `    CHECK ELEMENT ${label} == RESET`,
  ]);
}

/**
 * Generate the three constant-injection scripts (2×, 3×, 4× pickup) for a
 * single 51-type element. Intended for direct use in tests and export pipelines.
 *
 * @param element  Base element type: '51P', '51G', or '51N'
 * @param relay    Parsed relay settings (source of pickup, TD, curve)
 * @returns        Array of { label, content } — one entry per multiplier
 */
export function generateScriptsForElement(
  element: string,
  relay: ParsedRelaySettings,
): Array<{ label: string; content: string }> {
  const base = element.replace(/\d+$/, '').toUpperCase();
  if (!['51P', '51G', '51N'].includes(base)) return [];

  const map = buildSettingsMap(relay);
  return [2, 3, 4].map(M => ({
    label:   `${relay.tag}_${element}_${M}x`,
    content: buildTOCConstantScript(base, map, relay, element, [0], 'A', M),
  }));
}

/** Instantaneous Overcurrent (50P, 50G, 50N) — step or pulse-ramp injection. */
function buildIOCProfile(
  element: string,
  map: SettingsMap,
  relay: ParsedRelaySettings,
  label: string,
  sourceLines: number[],
  pattern: string,
): string {
  const pickup = extractPickupSetting(map, element);
  const pu     = pickup.value;

  // Use PULSE_RAMP when a TOC (51P/51G) is also present — need to blow past
  // the TOC pickup threshold before the timer expires.
  const has51 =
    map.has('51P1P') || map.has('51PPU') || map.has('51PP') ||
    map.has('51P1PU') || map.has('51GPU') || map.has('51G1P');
  const method = has51 ? 'PULSE_RAMP' : 'RAMP';
  const rampMs = has51 ? 50 : 100;
  const faultA = pu * 1.05;

  const isGround = element === '50G' || element === '50N';
  const ch       = isGround ? 'IN' : 'IA';

  const puNote = pickup.isDefault
    ? ` (default — ${pickup.key} not found)`
    : ` (from ${pickup.key})`;

  // Try to name the companion 51 element for the CHECK assertion
  const companion51 = element.replace('50', '51');

  const body: string[] = [
    `  STATE 1`,
    `    * Prefault — relay initialisation`,
    `    INJECT ${ch} 0.00 0.0`,
    `    PREFAULT 300`,
    ``,
    `  STATE 2`,
    `    * ${method} to 105% of ${element} pickup (${fmt(faultA)} A) in ${rampMs} ms`,
  ];
  if (has51) {
    body.push(`    * Fast ramp avoids TOC element timing out before ${element} picks up`);
  }
  body.push(
    `    ${method} ${ch} FROM 0.00 TO ${fmt(faultA)} IN ${rampMs}`,
    `    CHECK ELEMENT ${label} == PICKUP`,
    `    CHECK ELEMENT ${label} == TRIP`,
  );
  if (has51) {
    body.push(
      `    * TOC element also picks up — verify:`,
      `    CHECK ELEMENT ${companion51} == PICKUP`,
    );
  }
  body.push(
    ``,
    `  STATE 3`,
    `    * Remove fault — verify reset`,
    `    INJECT ${ch} 0.00 0.0`,
    `    WAIT 50`,
    `    CHECK ELEMENT ${label} == RESET`,
  );

  const extra: string[] = [
    `* Pickup Setting:   ${fmt(pu)} A secondary${puNote}`,
    `* Injection Method: ${method}`,
  ];
  if (has51) {
    extra.push(
      `* NOTE: PULSE_RAMP used — 51P/51G present in relay settings.`,
      `*       Fast ramp prevents TOC element timing out before ${element} picks up.`,
    );
  }

  return buildScript(label, relay, sourceLines, pattern, element, method, extra, body);
}

/** Distance (21P, 21G) — impedance injection at fraction of zone reach. */
function buildDistanceProfile(
  element: string,
  map: SettingsMap,
  relay: ParsedRelaySettings,
  label: string,
  sourceLines: number[],
  pattern: string,
): string {
  const isGnd  = element === '21G';
  const z1keys = isGnd ? ['21G1R', 'Z1GMAG'] : ['21P1R', 'Z1MAG'];
  const z2keys = isGnd ? ['21G2R', 'Z2GMAG'] : ['21P2R', 'Z2MAG'];

  let z1reach = 0, z1key = '(default)';
  for (const k of z1keys) {
    const v = map.get(k.toUpperCase());
    if (v) { z1reach = parseFloat(v); z1key = k; break; }
  }
  if (!z1reach) { z1reach = 4.0; z1key = '(default)'; }

  let z2reach = 0, z2key = '(default)';
  for (const k of z2keys) {
    const v = map.get(k.toUpperCase());
    if (v) { z2reach = parseFloat(v); z2key = k; break; }
  }
  if (!z2reach) { z2reach = z1reach * 1.5; z2key = '(default)'; }

  const lineAngle = getFloat(map, '67ANG', 85.0);
  const vnom      = getFloat(map, 'VNOM', 67.0);

  // Zone 1 test: 85% of Z1 reach (firmly inside zone, away from boundary)
  const zTest  = z1reach * 0.85;
  const faultI = vnom / zTest;
  const vFault = zTest * faultI;  // reduced voltage at fault point

  return buildScript(label, relay, sourceLines, pattern, element, 'IMPEDANCE', [
    `* Zone 1 Reach:     ${fmt(z1reach)} Ω secondary (${z1key})`,
    `* Zone 2 Reach:     ${fmt(z2reach)} Ω secondary (${z2key})`,
    `* Line Angle:       ${lineAngle}°`,
    `* Test Impedance:   ${fmt(zTest)} Ω (85% of Z1 reach)`,
    `* Fault Current:    ${fmt(faultI)} A secondary (Vnom ${fmt(vnom)} V / Ztest ${fmt(zTest)} Ω)`,
  ], [
    `  STATE 1`,
    `    * Prefault — nominal voltage, no current`,
    `    INJECT VA ${fmt(vnom)} 0.0`,
    `    INJECT VB ${fmt(vnom)} -120.0`,
    `    INJECT VC ${fmt(vnom)} 120.0`,
    `    INJECT IA 0.00 0.0`,
    `    PREFAULT 500`,
    ``,
    `  STATE 2`,
    `    * Apply Zone 1 fault: Vfault reduced, IA at fault impedance angle`,
    `    INJECT VA ${fmt(vFault)} 0.0`,
    `    INJECT IA ${fmt(faultI)} ${fmt(-lineAngle)}`,
    `    WAIT 50`,
    `    CHECK ELEMENT ${label} == PICKUP`,
    `    CHECK ELEMENT ${label} == TRIP`,
    `    CHECK TIMING ${label} WITHIN 0 20`,
    ``,
    `  STATE 3`,
    `    * Restore prefault — verify Zone 1 resets`,
    `    INJECT VA ${fmt(vnom)} 0.0`,
    `    INJECT IA 0.00 0.0`,
    `    WAIT 100`,
    `    CHECK ELEMENT ${label} == RESET`,
    ``,
    `  STATE 4`,
    `    * Zone 2 test: inject at 85% of Z2 reach (${fmt(z2reach * 0.85)} Ω)`,
    `    INJECT VA ${fmt(z2reach * 0.85 * faultI)} 0.0`,
    `    INJECT IA ${fmt(faultI)} ${fmt(-lineAngle)}`,
    `    WAIT 100`,
    `    CHECK ELEMENT ${label} == PICKUP`,
    ``,
    `  STATE 5`,
    `    * Restore prefault`,
    `    INJECT VA ${fmt(vnom)} 0.0`,
    `    INJECT IA 0.00 0.0`,
    `    WAIT 50`,
    `    CHECK ELEMENT ${label} == RESET`,
  ]);
}

/** Differential (87L, 87T) — differential injection + through-fault restraint. */
function buildDifferentialProfile(
  element: string,
  map: SettingsMap,
  relay: ParsedRelaySettings,
  label: string,
  sourceLines: number[],
  pattern: string,
): string {
  const isXfmr  = element === '87T';
  const pickup   = extractPickupSetting(map, element);
  const pu       = pickup.value;
  const faultI   = pu * 1.1;
  const thruI    = Math.max(5.0, pu * 10);  // through-fault > bias threshold

  // Slope setting
  const slopeKeys = isXfmr ? ['87TRS', '87SLP1'] : ['87LS', '87SLP1'];
  let slope = 0.35;
  for (const k of slopeKeys) {
    const v = map.get(k.toUpperCase());
    if (v) { slope = parseFloat(v); break; }
  }

  const puNote = pickup.isDefault
    ? ` (default — ${pickup.key} not found)`
    : ` (from ${pickup.key})`;

  return buildScript(label, relay, sourceLines, pattern, element, 'DIFFERENTIAL', [
    `* Minimum Pickup:   ${fmt(pu)} A differential secondary${puNote}`,
    `* Slope Setting:    ${fmt(slope * 100, 0)}%`,
    `* Trip test:        IA=${fmt(faultI)} A, IB=0 A → Idiff=${fmt(faultI)} A`,
    `* Restraint test:   IA=${fmt(thruI)} A, IB=${fmt(thruI)} A @ 180° → through-fault`,
  ], [
    `  STATE 1`,
    `    * Prefault — no current`,
    `    INJECT IA 0.00 0.0`,
    `    INJECT IB 0.00 0.0`,
    `    PREFAULT 300`,
    ``,
    `  STATE 2`,
    `    * Differential trip: IA=110% of min pickup, IB=0 → Idiff=${fmt(faultI)} A`,
    `    INJECT IA ${fmt(faultI)} 0.0`,
    `    INJECT IB 0.00 0.0`,
    `    WAIT 50`,
    `    CHECK ELEMENT ${label} == PICKUP`,
    `    CHECK ELEMENT ${label} == TRIP`,
    ``,
    `  STATE 3`,
    `    * Remove fault — verify reset`,
    `    INJECT IA 0.00 0.0`,
    `    WAIT 50`,
    `    CHECK ELEMENT ${label} == RESET`,
    ``,
    `  STATE 4`,
    `    * Through-fault restraint: IA and IB balanced (180°) — Idiff≈0`,
    `    * Relay must be restrained — no trip for through-fault`,
    `    INJECT IA ${fmt(thruI)} 0.0`,
    `    INJECT IB ${fmt(thruI)} 180.0`,
    `    WAIT 100`,
    `    CHECK ELEMENT ${label} == RESET`,
    `    * Restrained by slope characteristic — verify no TRIP`,
    ``,
    `  STATE 5`,
    `    * Restore zero — verify clean reset`,
    `    INJECT IA 0.00 0.0`,
    `    INJECT IB 0.00 0.0`,
    `    WAIT 50`,
    `    CHECK ELEMENT ${label} == RESET`,
  ]);
}

/** Directional Overcurrent (67P, 67G) — forward vs. reverse fault angle test. */
function buildDirectionalProfile(
  element: string,
  map: SettingsMap,
  relay: ParsedRelaySettings,
  label: string,
  sourceLines: number[],
  pattern: string,
): string {
  const pickup    = extractPickupSetting(map, element);
  const td        = extractTimeDial(map, element);
  const pu        = pickup.value;
  const vnom      = getFloat(map, 'VNOM', 67.0);
  const lineAngle = getFloat(map, '67ANG', 85.0);
  const faultI    = pu * 1.1;
  const faultV    = vnom * 0.8;  // depressed voltage at fault

  return buildScript(label, relay, sourceLines, pattern, element, 'RAMP', [
    `* Pickup Setting:   ${fmt(pu)} A secondary (from ${pickup.key})`,
    `* Time Dial:        ${fmt(td.value)} (from ${td.key})`,
    `* Forward fault:    IA=${fmt(faultI)} A @ ${fmt(-lineAngle)}°, VA=${fmt(faultV)} V @ 0°`,
    `* Reverse fault:    IA=${fmt(faultI)} A @ ${fmt(180.0 - lineAngle)}° (outside forward characteristic)`,
  ], [
    `  STATE 1`,
    `    * Prefault — nominal voltage, no current`,
    `    INJECT VA ${fmt(vnom)} 0.0`,
    `    INJECT VB ${fmt(vnom)} -120.0`,
    `    INJECT VC ${fmt(vnom)} 120.0`,
    `    INJECT IA 0.00 0.0`,
    `    PREFAULT 500`,
    ``,
    `  STATE 2`,
    `    * Forward fault: IA within forward characteristic`,
    `    INJECT VA ${fmt(faultV)} 0.0`,
    `    INJECT IA ${fmt(faultI)} ${fmt(-lineAngle)}`,
    `    WAIT 50`,
    `    CHECK ELEMENT ${label} == PICKUP`,
    ``,
    `  STATE 3`,
    `    * Restore prefault — verify directional element resets`,
    `    INJECT VA ${fmt(vnom)} 0.0`,
    `    INJECT IA 0.00 0.0`,
    `    WAIT 100`,
    `    CHECK ELEMENT ${label} == RESET`,
    ``,
    `  STATE 4`,
    `    * Reverse fault: IA outside forward characteristic (angle reversed)`,
    `    INJECT VA ${fmt(faultV)} 0.0`,
    `    INJECT IA ${fmt(faultI)} ${fmt(180.0 - lineAngle)}`,
    `    WAIT 50`,
    `    CHECK ELEMENT ${label} == RESET`,
    `    * Directional element must NOT pick up for reverse fault`,
    ``,
    `  STATE 5`,
    `    * Restore prefault`,
    `    INJECT VA ${fmt(vnom)} 0.0`,
    `    INJECT IA 0.00 0.0`,
    `    WAIT 50`,
  ]);
}

/** Recloser (79) — trip + reclose sequence. */
function buildRecloserProfile(
  map: SettingsMap,
  relay: ParsedRelaySettings,
  label: string,
  sourceLines: number[],
  pattern: string,
): string {
  const dtd1Ms = Math.round(getFloat(map, '79DTD1', 0.5) * 1000);
  const dtd2Ms = Math.round(getFloat(map, '79DTD2', 5.0) * 1000);

  // Derive trip current from available TOC setting
  const pu51 = getFloat(map, '51PPU',
    getFloat(map, '51P1P',
    getFloat(map, '51GPU',
    getFloat(map, '51G1P', 5.0))));
  const faultI = pu51 * 2.0;

  return buildScript(label, relay, sourceLines, pattern, '79', 'RAMP', [
    `* Reclose Delay 1:  ${dtd1Ms} ms (79DTD1)`,
    `* Reclose Delay 2:  ${dtd2Ms} ms (79DTD2)`,
    `* Trip current:     ${fmt(faultI)} A (2× TOC pickup)`,
  ], [
    `  STATE 1`,
    `    * Prefault — no current`,
    `    INJECT IA 0.00 0.0`,
    `    PREFAULT 300`,
    ``,
    `  STATE 2`,
    `    * Inject fault current — cause initial trip`,
    `    INJECT IA ${fmt(faultI)} 0.0`,
    `    WAIT 500`,
    `    CHECK ELEMENT ${label} == TRIP`,
    `    CHECK CONTACT TRIP == 1`,
    ``,
    `  STATE 3`,
    `    * Remove fault — wait for 79DTD1 reclose (${dtd1Ms} ms)`,
    `    INJECT IA 0.00 0.0`,
    `    WAIT ${dtd1Ms + 100}`,
    `    CHECK CONTACT CLOSE == 1`,
    ``,
    `  STATE 4`,
    `    * Re-inject fault — second trip (shot 2)`,
    `    INJECT IA ${fmt(faultI)} 0.0`,
    `    WAIT 500`,
    `    CHECK ELEMENT ${label} == TRIP`,
    `    CHECK CONTACT TRIP == 1`,
    ``,
    `  STATE 5`,
    `    * Remove fault — wait for 79DTD2 reclose (${dtd2Ms} ms)`,
    `    INJECT IA 0.00 0.0`,
    `    WAIT ${dtd2Ms + 100}`,
    `    CHECK CONTACT CLOSE == 1`,
  ]);
}

/**
 * Build a digital logic-only script for PAC controllers and pure logic elements.
 * Uses SET BINARY / CHECK CONTACT commands (no analog injection).
 */
function buildLogicProfile(
  tc: GeneratedTestCase,
  relay: ParsedRelaySettings,
): string {
  const header = buildHeader(
    tc.label, relay, tc.sourceLines, tc.pattern,
    'LOGIC', 'DIGITAL',
    [
      `* NOTE: PAC/logic-only element — digital SET/CHECK injection is appropriate.`,
      `*       No analog protection settings apply to this equation.`,
    ],
  );

  const lines: string[] = [`${header}`, `INIT`];
  for (const state of tc.states) {
    lines.push(`  STATE ${state.stateNumber}`);
    lines.push(`    * ${state.description}`);
    for (const step of state.steps) {
      switch (step.type) {
        case 'COMMENT': lines.push(`    * ${step.comment}`);                              break;
        case 'SET': {
          const sig = step.signal ?? '';
          if (isComputedOutput(sig)) {
            lines.push(`    * NOTE: ${sig} is a computed output — assert via analog injection per trip equation`);
            lines.push(`    * TODO: inject analog quantities to satisfy trip equation for ${sig}`);
          } else {
            lines.push(`    SET BINARY ${sig} ${step.value}`);
          }
          break;
        }
        case 'WAIT':    lines.push(`    WAIT ${step.ms}`);                                break;
        case 'CHECK':   lines.push(`    CHECK CONTACT ${step.signal} == ${step.value}`);  break;
      }
    }
  }
  lines.push(`END`);
  return lines.join('\n') + '\n';
}

// ─── Inhibit script builder ───────────────────────────────────────────────────

/**
 * Build an inhibit test script that proves a NOT guard or AND supervisor
 * causally blocks the trip output.
 *
 * Script structure:
 *   STATE 1 — Prefault, assert blocking condition
 *   STATE 2 — Inject fault stimulus (same as positive test)
 *   STATE 3 — Verify trip BLOCKED (element picks up, but trip = 0)
 *   STATE 4 — Release block, verify trip NOW asserts
 *   STATE 5 — Remove fault, verify element resets
 */
function buildInhibitProfile(
  tc: GeneratedTestCase,
  relay: ParsedRelaySettings,
  map: SettingsMap,
): string {
  const leaf         = tc.leafElement ?? tc.label;
  const blockSig     = tc.blockingSignal ?? 'UNKNOWN';
  const blockType    = tc.blockingType ?? 'NOT';
  const andConds     = tc.andConditions ?? [];
  const notConds     = tc.notConditions ?? [];
  const protFn       = classifyElement(leaf);

  // Determine fault stimulus channel and magnitude from element type
  const isGnd     = /51G|51N|50G|50N|SEF|87T/.test(protFn);
  const ch        = (protFn === '21P' || protFn === '21G' || protFn === '67P' || protFn === '67G') ? 'IA' : (isGnd ? 'IN' : 'IA');
  const vnom      = getFloat(map, 'VNOM', 67.0);

  // Fault level: 2× pickup for TOC, 1.05× for IOC, Vnom/Z for distance
  let faultI = 10.0;
  let faultAngle = 0.0;
  let injectVoltage = false;
  if (protFn === '51P' || protFn === '51G' || protFn === '51N' || protFn === 'SEF') {
    const pickup = extractPickupSetting(map, protFn);
    faultI = pickup.value * 2.0;
  } else if (protFn === '50P' || protFn === '50G' || protFn === '50N') {
    const pickup = extractPickupSetting(map, protFn);
    faultI = pickup.value * 1.05;
  } else if (protFn === '21P' || protFn === '21G') {
    const z1reach = getFloat(map, '21P1R', getFloat(map, '21G1R', 4.0)) * 0.85;
    faultI = vnom / z1reach;
    faultAngle = -getFloat(map, '67ANG', 85.0);
    injectVoltage = true;
  } else if (protFn === '67P' || protFn === '67G') {
    const pickup = extractPickupSetting(map, protFn);
    faultI = pickup.value * 1.1;
    faultAngle = -getFloat(map, '67ANG', 85.0);
    injectVoltage = true;
  } else if (protFn === '87L' || protFn === '87T') {
    const pickup = extractPickupSetting(map, protFn);
    faultI = pickup.value * 1.1;
  }

  // Blocking: NOT type = assert signal to block; AND type = de-assert signal to block
  const assertVal  = blockType === 'NOT' ? 1 : 0;  // value that creates the block
  const releaseVal = blockType === 'NOT' ? 0 : 1;  // value that releases the block
  const blockDesc  = blockType === 'NOT'
    ? `${blockSig}=1 (NOT guard active — trip blocked)`
    : `${blockSig}=0 (AND supervisor absent — trip blocked)`;
  const releaseDesc = blockType === 'NOT'
    ? `${blockSig}=0 (block removed)`
    : `${blockSig}=1 (supervisor restored)`;

  const supervisorLines: string[] = [];
  for (const s of andConds) {
    if (isComputedOutput(s)) {
      supervisorLines.push(`    * NOTE: ${s} is a computed output — assert via analog injection`);
    } else {
      supervisorLines.push(`    SET BINARY ${s} 1          * Supervisor / AND condition`);
    }
  }
  for (const s of notConds) {
    if (isComputedOutput(s)) {
      supervisorLines.push(`    * NOTE: ${s} is a computed output — assert via analog injection`);
    } else {
      supervisorLines.push(`    SET BINARY ${s} 0          * NOT condition — de-assert blocking signal`);
    }
  }

  const header = buildHeader(tc.label, relay, tc.sourceLines, 'INHIBIT', leaf, 'DIGITAL', [
    `* ── NOT-Condition Inhibit Test ──────────────────────────────`,
    `* Blocking Signal:  ${blockSig}  (${blockType} guard)`,
    `* Block Mechanism:  ${blockDesc}`,
    `* Protected Element: ${leaf} (${protFn})`,
    `* Expected:         ${leaf} PICKUP, TRIP output = 0 while blocked`,
    `*                   TRIP output = 1 after block released`,
  ]);

  const body: string[] = [
    `  STATE 1`,
    `    * Prefault — assert blocking condition before fault`,
    `    INJECT ${ch} 0.00 0.0`,
    ...(injectVoltage ? [`    INJECT VA ${fmt(vnom)} 0.0`, `    INJECT VB ${fmt(vnom)} -120.0`, `    INJECT VC ${fmt(vnom)} 120.0`] : []),
    `    PREFAULT 500`,
    ...(isComputedOutput(blockSig)
      ? [`    * NOTE: ${blockSig} is a computed output — assert via analog injection`]
      : [`    SET BINARY ${blockSig} ${assertVal}    * ${blockDesc}`]),
    ...supervisorLines,
    `    WAIT 100`,
    ``,
    `  STATE 2`,
    `    * Apply fault stimulus — level that WOULD cause trip without block`,
    ...(injectVoltage ? [`    INJECT VA ${fmt(vnom * 0.5)} 0.0`] : []),
    `    INJECT ${ch} ${fmt(faultI)} ${fmt(faultAngle)}`,
    `    WAIT 300`,
    ``,
    `  STATE 3`,
    `    * Verify: element picks up BUT trip output is blocked`,
    `    CHECK ELEMENT ${leaf} == PICKUP`,
    `    CHECK CONTACT TRIP == 0         * Trip must NOT assert while blocked`,
    `    CHECK ELEMENT TR == 0           * Trip equation output must be 0`,
    ``,
    `  STATE 4`,
    `    * Release block — verify trip NOW asserts (proves block was causal)`,
    ...(isComputedOutput(blockSig)
      ? [`    * NOTE: ${blockSig} is a computed output — assert via analog injection`]
      : [`    SET BINARY ${blockSig} ${releaseVal}    * ${releaseDesc}`]),
    `    WAIT 50`,
    `    CHECK CONTACT TRIP == 1         * Trip asserts once block removed`,
    `    CHECK ELEMENT TR == 1`,
    ``,
    `  STATE 5`,
    `    * Remove fault — verify element resets`,
    `    INJECT ${ch} 0.00 0.0`,
    ...(injectVoltage ? [`    INJECT VA ${fmt(vnom)} 0.0`] : []),
    `    WAIT 200`,
    `    CHECK ELEMENT ${leaf} == RESET`,
  ];

  return `${header}\nINIT\n${body.join('\n')}\nEND\n`;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Render a physically meaningful analog injection script for a test case.
 *
 * For path-based test cases (from TRIP equations), uses tc.leafElement to
 * select the injection profile rather than tc.label. Supervisor/NOT conditions
 * stored on the test case are emitted as SET BINARY commands in the prefault state.
 *
 * For INHIBIT test cases (pattern === 'INHIBIT'), builds a blocking-logic
 * verification script that proves the guard signal is causally effective.
 */
export function renderAnalogScript(
  tc: GeneratedTestCase,
  relay: ParsedRelaySettings,
): string {
  const map = buildSettingsMap(relay);

  // ── INHIBIT pattern ────────────────────────────────────────────────────────
  if (tc.pattern === 'INHIBIT') {
    return buildInhibitProfile(tc, relay, map);
  }

  // ── Path-based positive test: use leafElement if present ──────────────────
  const elementLabel = tc.leafElement ?? tc.label;
  const protFn = classifyElement(elementLabel, tc.signals.join(' '));

  // Build supervisor / NOT-condition SET BINARY preamble
  const condPreamble: string[] = [];
  if (tc.andConditions && tc.andConditions.length > 0) {
    condPreamble.push(`    * Supervisor conditions (AND requirements):`);
    for (const s of tc.andConditions) {
      condPreamble.push(`    SET BINARY ${s} 1`);
    }
  }
  if (tc.notConditions && tc.notConditions.length > 0) {
    condPreamble.push(`    * Blocking signals de-asserted (NOT requirements):`);
    for (const s of tc.notConditions) {
      condPreamble.push(`    SET BINARY ${s} 0`);
    }
  }

  // Attach preamble to relay object via a closure trick: wrap the script
  // builder call and prefix the preamble into STATE 1 prefault block.
  // We do this by building the script normally and then injecting the preamble.
  let script: string;
  switch (protFn) {
    case '51P':  script = buildTOCConstantScript(elementLabel, map, relay, elementLabel, tc.sourceLines, tc.pattern, 2); break;
    case '51G':  script = buildTOCConstantScript(elementLabel, map, relay, elementLabel, tc.sourceLines, tc.pattern, 2); break;
    case '51N':  script = buildTOCConstantScript(elementLabel, map, relay, elementLabel, tc.sourceLines, tc.pattern, 2); break;
    case 'SEF':  script = buildTOCConstantScript(elementLabel, map, relay, elementLabel, tc.sourceLines, tc.pattern, 2); break;
    case '50P':  script = buildIOCProfile('50P', map, relay, elementLabel, tc.sourceLines, tc.pattern); break;
    case '50G':  script = buildIOCProfile('50G', map, relay, elementLabel, tc.sourceLines, tc.pattern); break;
    case '50N':  script = buildIOCProfile('50N', map, relay, elementLabel, tc.sourceLines, tc.pattern); break;
    case '21P':  script = buildDistanceProfile('21P', map, relay, elementLabel, tc.sourceLines, tc.pattern); break;
    case '21G':  script = buildDistanceProfile('21G', map, relay, elementLabel, tc.sourceLines, tc.pattern); break;
    case '87L':  script = buildDifferentialProfile('87L', map, relay, elementLabel, tc.sourceLines, tc.pattern); break;
    case '87T':  script = buildDifferentialProfile('87T', map, relay, elementLabel, tc.sourceLines, tc.pattern); break;
    case '67P':  script = buildDirectionalProfile('67P', map, relay, elementLabel, tc.sourceLines, tc.pattern); break;
    case '67G':  script = buildDirectionalProfile('67G', map, relay, elementLabel, tc.sourceLines, tc.pattern); break;
    case '79':   script = buildRecloserProfile(map, relay, elementLabel, tc.sourceLines, tc.pattern); break;
    default:     return buildLogicProfile(tc, relay);
  }

  // Inject supervisor/NOT preamble immediately after INIT and before STATE 1
  if (condPreamble.length > 0) {
    const preambleBlock = [
      `  * ── Supervision / Blocking Signal Setup ──────────────────`,
      ...condPreamble,
    ].join('\n');
    script = script.replace('  STATE 1', `${preambleBlock}\n\n  STATE 1`);
  }

  return script;
}

/**
 * Render all test cases for a relay using analog injection profiles.
 *
 * 51-type positive tests (51P/51G/51N) are expanded to three scripts at
 * 2×, 3×, and 4× pickup for comprehensive curve verification.
 * All other element types and all INHIBIT tests produce one script each.
 */
export function renderAllAnalogScripts(
  testCases: GeneratedTestCase[],
  relay: ParsedRelaySettings,
): Array<{ filename: string; content: string }> {
  return testCases.flatMap(tc => {
    const elementLabel = tc.leafElement ?? tc.label;
    const protFn = classifyElement(elementLabel, tc.signals.join(' '));

    // 51-type positive tests → expand to three scripts (2×, 3×, 4×)
    if (['51P', '51G', '51N'].includes(protFn) && tc.pattern !== 'INHIBIT') {
      const map = buildSettingsMap(relay);
      return [2, 3, 4].map((M): { filename: string; content: string } => ({
        filename: `${relay.tag}_${elementLabel}_${M}x.rts`,
        content:  buildTOCConstantScript(elementLabel, map, relay, elementLabel, tc.sourceLines, tc.pattern, M),
      }));
    }

    // All other elements (including 51 INHIBIT tests) → single script
    return [{
      filename: tc.pattern === 'INHIBIT'
        ? `${relay.tag}_${tc.label}.rts`
        : `${relay.tag}_${tc.label}_Pat${tc.pattern}.rts`,
      content: renderAnalogScript(tc, relay),
    }];
  });
}

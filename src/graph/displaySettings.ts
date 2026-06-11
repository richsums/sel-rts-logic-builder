/**
 * @module graph/displaySettings
 * Extracts per-node display settings for inline rendering on graph node cards.
 * Classifies each node by its element type and pulls relevant settings values.
 */

import type { DependencyGraph } from '../selogic/graph';
import type { ParsedRelaySettings } from '../relay-adapters/common/types';
import {
  buildSettingsMap,
  extractPickupSetting,
  extractTimeDial,
  extractCurveType,
  getFloat,
  type SettingsMap,
} from '../rts/settings-extractor';
import { computeOperateTime } from '../rts/operate-time';
import { isTripWordBit as _isTripWordBit, resolvePickupBit } from './protection';
import { isSvBit, svBaseOf } from './svTiming';

// Protection element families that carry a pickup setting (excludes 79 recloser
// control bits, which are not pickup elements).
const PICKUP_ELEMENT_RE = /^(50|51|21|87|67|SEF|Z\d)/i;

// ─── Types ────────────────────────────────────────────────────────────────────

export type NodeKind = 'protection' | 'timer' | 'latch' | 'gate' | 'input' | 'trip';

export interface DisplaySetting {
  label: string;
  value: string;
  /** Show this row as a highlighted badge (e.g. warnings). */
  isBadge?: boolean;
}

export interface NodeDisplayInfo {
  kind: NodeKind;
  /** Emoji/icon prefix for the node header. */
  icon: string;
  /** Second line of the node header (relay tag + element category). */
  subtitle: string;
  /** Settings rows to display on the card, in order. */
  settings: DisplaySetting[];
  /** True if the user can click to toggle this node's logical state. */
  toggleable: boolean;
  /**
   * True if this is a trip word bit (e.g. 50P1T, 51G1T).
   * Trip word bits are computed — not directly user-toggleable — and
   * receive an amber/gold border to distinguish them from pickup bits.
   */
  isTripWordBit?: boolean;
  /** Timer PU time in seconds (used to drive the arc animation). */
  timerPuSeconds?: number;
  /** Timer DO time in seconds. */
  timerDoSeconds?: number;
}

// ─── Classification helpers ───────────────────────────────────────────────────

/** Strip trailing digit suffix to get the element base type, e.g. '51P1' → '51P'. */
export function baseElement(label: string): string {
  return label.toUpperCase().replace(/\d+$/, '');
}

/** Map a SEL curve code to a human-readable description. */
function curveName(code: string): string {
  const m: Record<string, string> = {
    U1: 'U1 (IEEE Mod Inv)',  U2: 'U2 (IEEE VI)',    U3: 'U3 (IEEE EI)',
    U4: 'U4 (IEEE STI)',      U5: 'U5 (IEEE LTI)',   C1: 'C1 (IEC SI)',
    C2: 'C2 (IEC VI)',        C3: 'C3 (IEC EI)',     C4: 'C4 (IEC LTEF)',
    C5: 'C5 (IEC LTI)',       DEF: 'Definite Time',  DT: 'Definite Time',
    MI: 'MI (IEEE Mod Inv)',  EI: 'EI (IEEE Ext Inv)', VI: 'VI (IEEE V Inv)',
  };
  return m[code.toUpperCase()] ?? code;
}

/** Classify a node into a display kind category. */
function classifyKind(nodeId: string, graph: DependencyGraph): NodeKind {
  const node = graph.nodes.get(nodeId);
  if (!node) return 'gate';

  const id = nodeId.toUpperCase();

  // Explicit output checks first
  if (id === 'TR' || id === 'TRIP' || id === 'CL' || id === 'CLOSE') return 'trip';

  // Protection element word bits (51P1T, 67P1T, 50N1…) are protection even when
  // they are graph inputs — a logic-only view has no upstream pickup node, but we
  // still want their pickup settings shown. They remain user-toggleable as stimuli.
  if (PICKUP_ELEMENT_RE.test(id)) return 'protection';

  // Input nodes (no defining equation)
  if (node.isInput) return 'input';

  // Function type from the equation
  const ft = node.equation?.functionType;
  if (ft === 'TIMER_IN' || ft === 'TIMER_OUT') return 'timer';
  if (ft === 'LATCH_SET' || ft === 'LATCH_RESET') return 'latch';

  // Pattern matching on node ID
  if (/^(51|50|21|87|67|79|SEF|Z\d)/.test(id)) return 'protection';
  if (/^(TD|LT)\d/.test(id)) return id.startsWith('LT') ? 'latch' : 'timer';
  if (/^SV\d/.test(id)) return 'latch';

  return 'gate';
}

// ─── SEL-351 direct setting resolution ───────────────────────────────────────
// SEL-351-family settings use the element id itself as the setting prefix:
//   51P1T / 51P1   → pickup 51P1P, curve 51P1C, time dial 51P1TD
//   67G2T / 67G2   → pickup 50G2P, delay 67G2D (cycles), torque ctrl 67G2TC
//   50G2 / 50N1    → pickup 50G2P / 50N1P
// Values of "OFF" are shown as OFF (element disabled).

function rawSetting(map: SettingsMap, key: string): string | undefined {
  return map.get(key.toUpperCase()) ?? map.get(key);
}

function fmtAmps(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  if (/^OFF$/i.test(raw.trim())) return 'OFF';
  const n = parseFloat(raw);
  return isNaN(n) ? raw : `${n.toFixed(2)} A sec`;
}

function sel351DirectInfo(
  nodeId: string,
  tag: string,
  map: SettingsMap,
): Omit<NodeDisplayInfo, 'kind' | 'toggleable'> | null {
  const id = nodeId.toUpperCase();

  // 51-series time-overcurrent: 51P1T, 51P1, 51G1T, 51Q(T)…
  let m = id.match(/^51(P|N|G|Q)(\d*)(T|R)?$/);
  if (m) {
    const base = `51${m[1]}${m[2]}`;
    const pk = fmtAmps(rawSetting(map, `${base}P`));
    if (pk === null) return null;                      // not this relay family
    const curve = rawSetting(map, `${base}C`);
    const td    = rawSetting(map, `${base}TD`);
    const tc    = rawSetting(map, `${base}TC`);
    const isTimed = m[3] === 'T';
    return {
      icon: '⚡',
      subtitle: `${tag} · Time OC ${isTimed ? '(timed out)' : '(pickup)'}`,
      settings: [
        { label: 'Pickup', value: pk },
        ...(curve ? [{ label: 'Curve', value: curve }] : []),
        ...(td ? [{ label: 'TD', value: td }] : []),
        ...(tc && tc !== '1' ? [{ label: 'Torque ctl', value: tc }] : []),
      ],
    };
  }

  // 67-series directional OC: 67G2T, 67P1T… — pickup lives in the 50-series key.
  m = id.match(/^67(P|N|G|Q)(\d)(T)?$/);
  if (m) {
    const pk = fmtAmps(rawSetting(map, `50${m[1]}${m[2]}P`));
    if (pk === null) return null;
    const delay = rawSetting(map, `67${m[1]}${m[2]}D`);
    const tc    = rawSetting(map, `67${m[1]}${m[2]}TC`);
    return {
      icon: '⚡',
      subtitle: `${tag} · Directional OC ${m[3] === 'T' ? '(timed out)' : '(pickup)'}`,
      settings: [
        { label: 'Pickup', value: pk },
        ...(delay ? [{ label: 'Delay', value: `${delay} cyc` }] : []),
        ...(tc && tc !== '1' ? [{ label: 'Torque ctl', value: tc }] : []),
      ],
    };
  }

  // 50-series instantaneous: 50P1, 50G2, 50N1…
  m = id.match(/^50(P|N|G|Q)(\d)$/);
  if (m) {
    const pk = fmtAmps(rawSetting(map, `${id}P`));
    if (pk === null) return null;
    return {
      icon: '⚡',
      subtitle: `${tag} · Instantaneous OC`,
      settings: [
        { label: 'Pickup', value: pk },
        { label: 'Delay', value: '0 ms (inst)' },
      ],
    };
  }

  return null;
}

// ─── Per-kind builders ────────────────────────────────────────────────────────

function buildProtectionInfo(
  nodeId: string,
  tag: string,
  map: SettingsMap,
): Omit<NodeDisplayInfo, 'kind' | 'toggleable'> {
  // SEL-351-family direct setting keys take priority when present.
  const direct = sel351DirectInfo(nodeId, tag, map);
  if (direct) return direct;
  // For trip word bits (51P1T) resolve to the pickup element (51P1P) so the
  // pickup/TD/curve settings are found.
  const elemId = _isTripWordBit(nodeId) ? resolvePickupBit(nodeId) : nodeId;
  const base = baseElement(elemId);
  const pickup = extractPickupSetting(map, elemId);
  const td     = extractTimeDial(map, elemId);
  const curve  = extractCurveType(map, elemId);
  // Show the configured pickup, or "—" when the element settings weren't imported.
  const pkA = (digits = 2) => (pickup.isDefault ? '—' : `${pickup.value.toFixed(digits)} A`);

  // ── Time-Overcurrent (51P / 51G / 51N / 67P / 67G) ──────────────────────
  if (/^(51|67)/.test(base)) {
    const tAt2x = computeOperateTime(curve, td.value, 2.0);
    const isDir = base.startsWith('67');
    return {
      icon:     '⚡',
      subtitle: `${tag} · ${isDir ? 'Directional OC' : 'Time Overcurrent'}`,
      settings: [
        { label: 'Pickup',       value: pkA(2) },
        { label: 'TD',           value: td.value.toFixed(2) },
        { label: 'Curve',        value: curveName(curve) },
        { label: 'tOP @ 2×',    value: isFinite(tAt2x) ? `${tAt2x.toFixed(2)} s` : '—' },
        ...(isDir ? [{ label: 'Direction', value: 'Forward' }] : []),
      ],
    };
  }

  // ── Instantaneous OC (50P / 50G / 50N) ───────────────────────────────────
  if (base.startsWith('50')) {
    return {
      icon:     '⚡',
      subtitle: `${tag} · Instantaneous`,
      settings: [
        { label: 'Pickup', value: pkA(1) },
        { label: 'Delay',  value: '0 ms (inst)' },
        { label: '',       value: '[PULSE RAMP required]', isBadge: true },
      ],
    };
  }

  // ── Distance (21P / 21G / 21N) ────────────────────────────────────────────
  if (base.startsWith('21')) {
    const z1  = getFloat(map, '21P1R',  getFloat(map, 'Z1MAG',  pickup.value));
    const z2  = getFloat(map, '21P2R',  getFloat(map, 'Z2MAG',  z1 * 2));
    const z3  = getFloat(map, '21P3R',  getFloat(map, 'Z3MAG',  z1 * 3));
    const ang = getFloat(map, 'Z1ANG',  getFloat(map, '21ANG',  75));
    const td2 = getFloat(map, '21P2TD', getFloat(map, 'Z2TD',   0.4));
    return {
      icon:     '📐',
      subtitle: `${tag} · Distance`,
      settings: [
        { label: 'Z1',        value: `${z1.toFixed(2)} Ω ∠${ang.toFixed(0)}°` },
        { label: 'Z2',        value: `${z2.toFixed(2)} Ω` },
        { label: 'Z3',        value: `${z3.toFixed(2)} Ω` },
        { label: 'Delay Z1',  value: 'instant' },
        { label: 'Delay Z2',  value: `${td2.toFixed(2)} s` },
      ],
    };
  }

  // ── Differential (87L / 87T) ───────────────────────────────────────────────
  if (base.startsWith('87')) {
    const minPkp = getFloat(map, base === '87L' ? '87LP' : '87TP',
                            getFloat(map, '87LPU', getFloat(map, '87TPU', 0.3)));
    const slp1 = getFloat(map, '87SLP1', getFloat(map, '87S1', 25));
    const slp2 = getFloat(map, '87SLP2', getFloat(map, '87S2', 60));
    const bp   = getFloat(map, '87BPT',  getFloat(map, '87BP', 3.0));
    return {
      icon:     '🔄',
      subtitle: `${tag} · Differential`,
      settings: [
        { label: 'Min Pkp',  value: `${minPkp.toFixed(2)} A` },
        { label: 'Slope 1',  value: `${slp1.toFixed(0)}%` },
        { label: 'Slope 2',  value: `${slp2.toFixed(0)}%` },
        { label: 'Breakpnt', value: `${bp.toFixed(1)} A` },
      ],
    };
  }

  // ── SEF (Sensitive Earth Fault) ────────────────────────────────────────────
  if (base === 'SEF') {
    return {
      icon:     '⚡',
      subtitle: `${tag} · SEF`,
      settings: [{ label: 'Pickup', value: pkA(3) }],
    };
  }

  // Generic protection fallback
  return {
    icon:     '⚡',
    subtitle: `${tag} · Protection`,
    settings: [{ label: 'Pickup',       value: pkA(2) }],
  };
}

// ─── Main extractor ───────────────────────────────────────────────────────────

/**
 * Extract display metadata for a single graph node.
 *
 * @param nodeId  Signal label (e.g. '51PT', 'TR', 'LT1S', '52A')
 * @param graph   Dependency graph (for node metadata and equations)
 * @param relay   Parsed relay settings (null → use defaults / show '—')
 */
export function extractDisplaySettings(
  nodeId: string,
  graph: DependencyGraph,
  relay: ParsedRelaySettings | null,
): NodeDisplayInfo {
  const node = graph.nodes.get(nodeId);
  const kind = classifyKind(nodeId, graph);
  const tag  = relay?.tag ?? '';
  const map  = relay ? buildSettingsMap(relay) : new Map<string, string>();

  // ── Input signal ──────────────────────────────────────────────────────────
  if (kind === 'input') {
    return {
      kind:      'input',
      icon:      '↑',
      subtitle:  node?.description ?? 'Input signal',
      settings:  [],
      toggleable: true,
    };
  }

  // ── Trip output ───────────────────────────────────────────────────────────
  if (kind === 'trip') {
    const expr = node?.equation?.expression ?? '—';
    const uid = nodeId.toUpperCase();
    // Don't call a close/other output a "Trip" output.
    const role = (uid === 'TR' || uid === 'TRIP') ? 'Trip Output'
      : (uid === 'CL' || uid === 'CLOSE') ? 'Close Output'
      : 'Output';
    return {
      kind:      'trip',
      icon:      '⚡',
      subtitle:  `${tag} · ${role}`,
      settings:  [{ label: 'Logic', value: expr.length > 24 ? expr.slice(0, 24) + '…' : expr }],
      toggleable: false,
    };
  }

  // ── Timer (incl. SV timed word bit SVnT) ───────────────────────────────────
  if (kind === 'timer') {
    const upper  = nodeId.toUpperCase();
    const svBase = svBaseOf(upper);                       // "SV2T" → "SV2"
    const baseId = svBase ?? upper.replace(/[SR]$/, '');  // strip S/R for TD timers
    const puKey  = `${baseId}PU`.toUpperCase();
    const doKey  = `${baseId}DO`.toUpperCase();
    const puTime = getFloat(map, puKey, getFloat(map, 'TD1PU', 0.5));
    const doTime = getFloat(map, doKey, getFloat(map, 'TD1DO', 0.1));
    return {
      kind:           'timer',
      icon:           '⏱',
      subtitle:       svBase ? `${tag} · ${svBase} timed` : `${tag} · Timer`,
      settings: [
        ...(svBase ? [{ label: 'Asserts from', value: svBase }] : []),
        { label: 'PU Time', value: `${puTime.toFixed(2)} s` },
        { label: 'DO Time', value: `${doTime.toFixed(2)} s` },
      ],
      toggleable:     false,
      timerPuSeconds: puTime,
      timerDoSeconds: doTime,
    };
  }

  // ── Latch / Sealing element / SV ───────────────────────────────────────────
  if (kind === 'latch') {
    const expr = node?.equation?.expression ?? '—';
    const ft   = node?.equation?.functionType;
    const upper = nodeId.toUpperCase();
    const isRawSv = isSvBit(upper);                       // "SV2" (the SELOGIC var)
    const isSet = ft === 'LATCH_SET' || (!isRawSv && upper.endsWith('S'));
    const fmt = (s: string) => (s.length > 22 ? s.slice(0, 22) + '…' : s);

    // The SELOGIC equation row — shown for every SV / latch element, like outputs.
    const settings: DisplaySetting[] = [
      { label: isRawSv ? 'Logic' : isSet ? 'Set' : 'Reset', value: fmt(expr) },
    ];

    // SV bits carry PU/DO timing (SVnPU / SVnDO).
    const svm = upper.match(/^SV(\d+)/);
    if (svm) {
      const n = svm[1];
      const get = (k: string) => map.get(k) ?? map.get(k.toUpperCase()) ?? map.get(k.toLowerCase());
      const pu = get(`SV${n}PU`) ?? get(`SV0${n}PU`);
      const dop = get(`SV${n}DO`) ?? get(`SV0${n}DO`);
      if (pu !== undefined) settings.push({ label: 'PU Time', value: `${pu} s` });
      if (dop !== undefined) settings.push({ label: 'DO Time', value: `${dop} s` });
    }

    const role = isRawSv ? 'SELOGIC Variable' : isSet ? 'Latch Set' : 'Latch Reset';
    return {
      kind:      'latch',
      icon:      '🔒',
      subtitle:  `${tag} · ${role}`,
      settings,
      toggleable: false,
    };
  }

  // ── Logic gate / computed equation ────────────────────────────────────────
  if (kind === 'gate') {
    const expr = node?.equation?.expression ?? '—';
    return {
      kind:      'gate',
      icon:      '⊕',
      subtitle:  node?.description ?? 'Logic',
      settings:  [{ label: 'Expr', value: expr.length > 24 ? expr.slice(0, 24) + '…' : expr }],
      toggleable: false,
    };
  }

  // ── Protection element ────────────────────────────────────────────────────
  const protInfo = buildProtectionInfo(nodeId, tag, map);
  const isTWB = _isTripWordBit(nodeId);
  // Trip word bits computed from an upstream pickup are locked; but when the bit
  // is a graph input (logic-only view) it's a stimulus the user toggles to test.
  const toggleable = (node?.isInput ?? false) || !isTWB;
  return {
    kind:         'protection',
    toggleable,
    isTripWordBit: isTWB,
    ...protInfo,
  };
}

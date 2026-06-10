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
import { isTripWordBit as _isTripWordBit } from './protection';

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

// ─── Per-kind builders ────────────────────────────────────────────────────────

function buildProtectionInfo(
  nodeId: string,
  tag: string,
  map: SettingsMap,
): Omit<NodeDisplayInfo, 'kind' | 'toggleable'> {
  const base = baseElement(nodeId);
  const pickup = extractPickupSetting(map, nodeId);
  const td     = extractTimeDial(map, nodeId);
  const curve  = extractCurveType(map, nodeId);

  // ── Time-Overcurrent (51P / 51G / 51N / 67P / 67G) ──────────────────────
  if (/^(51|67)/.test(base)) {
    const tAt2x = computeOperateTime(curve, td.value, 2.0);
    const isDir = base.startsWith('67');
    return {
      icon:     '⚡',
      subtitle: `${tag} · ${isDir ? 'Directional OC' : 'Time Overcurrent'}`,
      settings: [
        { label: 'Pickup',       value: `${pickup.value.toFixed(2)} A` },
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
        { label: 'Pickup', value: `${pickup.value.toFixed(1)} A` },
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
      settings: [{ label: 'Pickup', value: `${pickup.value.toFixed(3)} A` }],
    };
  }

  // Generic protection fallback
  return {
    icon:     '⚡',
    subtitle: `${tag} · Protection`,
    settings: [{ label: 'Pickup', value: `${pickup.value.toFixed(2)} A` }],
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
    return {
      kind:      'trip',
      icon:      '⚡',
      subtitle:  `${tag} · Trip Output`,
      settings:  [{ label: 'Logic', value: expr.length > 24 ? expr.slice(0, 24) + '…' : expr }],
      toggleable: false,
    };
  }

  // ── Timer ─────────────────────────────────────────────────────────────────
  if (kind === 'timer') {
    const baseId = nodeId.toUpperCase().replace(/[SR]$/, ''); // strip S/R suffixes
    const puKey  = `${baseId}PU`.toUpperCase();
    const doKey  = `${baseId}DO`.toUpperCase();
    const puTime = getFloat(map, puKey, getFloat(map, 'TD1PU', 0.5));
    const doTime = getFloat(map, doKey, getFloat(map, 'TD1DO', 0.1));
    return {
      kind:           'timer',
      icon:           '⏱',
      subtitle:       `${tag} · Timer`,
      settings: [
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
    const isSet = ft === 'LATCH_SET' || nodeId.toUpperCase().endsWith('S');
    const settings: DisplaySetting[] = [
      { label: isSet ? 'Set' : 'Reset', value: expr.length > 20 ? expr.slice(0, 20) + '…' : expr },
    ];

    // SV supervisory bits also carry PU/DO timing (SVnPU / SVnDO).
    const svm = nodeId.toUpperCase().match(/^SV(\d+)/);
    if (svm) {
      const n = svm[1];
      const get = (k: string) => map.get(k) ?? map.get(k.toUpperCase()) ?? map.get(k.toLowerCase());
      const pu = get(`SV${n}PU`) ?? get(`SV0${n}PU`);
      const dop = get(`SV${n}DO`) ?? get(`SV0${n}DO`);
      if (pu !== undefined) settings.push({ label: 'PU Time', value: `${pu} s` });
      if (dop !== undefined) settings.push({ label: 'DO Time', value: `${dop} s` });
    }

    return {
      kind:      'latch',
      icon:      '🔒',
      subtitle:  `${tag} · ${isSet ? 'Latch Set' : 'Latch Reset'}`,
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
  return {
    kind:         'protection',
    toggleable:   !isTWB,   // T-bits are computed, not user-toggleable
    isTripWordBit: isTWB,
    ...protInfo,
  };
}

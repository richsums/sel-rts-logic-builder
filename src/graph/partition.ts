/**
 * @module graph/partition
 * Splits a DependencyGraph into labeled "logic areas" (windows), one per driven
 * output contact / coil, plus dedicated areas for active SVs and (optionally)
 * LEDs and front-panel pushbuttons.
 *
 * Partitioning is a DISPLAY-LAYER concern: the simulation engine
 * (`graph/propagate.ts`) keeps operating on the single id-keyed SignalStates
 * map. `graph/areaLayout.ts` clones each area's cone into its own React Flow
 * group node, so a signal shared by several areas appears in each of them while
 * staying state-synced (every instance reads/writes the same logical id).
 */

import type { DependencyGraph } from '../selogic/graph';
import type { ParsedRelaySettings } from '../relay-adapters/common/types';
import { parseExpression } from '../selogic/parser';
import { collectSignals } from '../selogic/ast';
import { parseOutputContacts } from './buildReactFlow';
import { extractEnabledLeds, extractEnabledPushbuttons } from './ledPb';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AreaKind = 'output' | 'sv' | 'lt' | 'led' | 'pb';

export interface LogicArea {
  /** Stable area id, e.g. "area_OUT101" / "area_SV1" / "area_LED3". */
  id: string;
  /** Human label by purpose, e.g. "Trip — OUT101 / TR". */
  label: string;
  kind: AreaKind;
  /** Output/coil/SV/LED/PB ids that anchor this area. */
  rootIds: string[];
  /** All logical signal ids shown in this area (cone + roots + contact ids). */
  nodeIds: string[];
}

export interface PartitionResult {
  areas: LogicArea[];
  /** Every logical signal id that appears in at least one OUTPUT area cone. */
  usedSignalIds: Set<string>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COIL_IDS = new Set(['TR', 'TRIP', 'CL', 'CLOSE', 'ALARM', 'ALRMOUT']);

// An output expression that drives nothing (e.g. "OUT104 = 0", "NA", blank).
const DISABLED_EXPR_RE = /^\s*(|0|NA|N\/A|OFF|N|NONE)\s*$/i;

function coilPurpose(id: string): string {
  const u = id.toUpperCase();
  if (/^(TR|TRIP)$/.test(u)) return 'Trip';
  if (/^(CL|CLOSE)$/.test(u)) return 'Close';
  if (/^(ALARM|ALRMOUT|SALARM)$/.test(u)) return 'Alarm';
  if (/^OUT/.test(u)) return 'Output';
  return id;
}

/** Signals directly referenced in a SELogic expression. */
function signalsInExpr(expr: string): string[] {
  const ast = parseExpression(expr);
  if (!ast) return [];
  return Array.from(collectSignals(ast));
}

/**
 * Upstream closure over `dependencies`. Includes the start ids themselves.
 * Nodes in `stopAt` are included as BOUNDARY STUBS — their own upstream logic is
 * not pulled in, because it lives in that signal's own window (e.g. TRIP inside
 * the Close window shows as a stub; the trip logic stays in the Trip window).
 */
function upstreamClosure(
  graph: DependencyGraph,
  starts: string[],
  stopAt?: Set<string>,
): Set<string> {
  const seen = new Set<string>();
  const stack = [...starts];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    if (stopAt?.has(id) && !starts.includes(id)) continue;  // boundary stub
    const n = graph.nodes.get(id);
    if (n) for (const d of n.dependencies) if (!seen.has(d)) stack.push(d);
  }
  return seen;
}

// ─── Main entry ─────────────────────────────────────────────────────────────

export interface PartitionOptions {
  /** Include LED and front-panel PB areas (default false). */
  includeLedPb?: boolean;
  /** Include SV windows (default true). When off, SV logic expands inline. */
  includeSv?: boolean;
  /** Include LT latch windows (default true). When off, latch logic expands inline. */
  includeLt?: boolean;
}

export function partitionGraph(
  graph: DependencyGraph,
  relay: ParsedRelaySettings | null,
  opts: PartitionOptions = {},
): PartitionResult {
  const includeSv = opts.includeSv ?? true;
  const includeLt = opts.includeLt ?? true;
  const contacts = parseOutputContacts(relay); // Map<OUTxxx, expr>
  const areas: LogicArea[] = [];
  const usedSignalIds = new Set<string>();

  // ── Window-boundary signals ───────────────────────────────────────────────
  // Signals that anchor their own window appear as stubs inside other windows
  // (no upstream expansion there). TRIP/CLOSE always; SVs/LTs only while their
  // windows are shown — hiding those windows expands the logic inline instead.
  const boundary = new Set<string>();
  for (const [id, node] of graph.nodes) {
    if (node.synthetic === 'seal') boundary.add(id);
    if (includeLt && node.synthetic === 'latch') boundary.add(id);
    if (includeSv && (node.synthetic === 'svt' || (/^SV\d+$/i.test(id) && node.equation))) {
      boundary.add(id);
    }
  }

  // Coils that a contact routes 1:1 (so we don't also emit a standalone area).
  const routedCoils = new Set<string>();
  for (const [, expr] of contacts) {
    const ops = signalsInExpr(expr);
    if (ops.length === 1 && (graph.nodes.has(ops[0]) || COIL_IDS.has(ops[0].toUpperCase()))) {
      routedCoils.add(ops[0]);
    }
  }

  // ── 1. One area per driven coil, with EVERY contact that routes it ────────
  // OUT101 = TRIP and OUT103 = TRIP belong in one "Trip" window, downstream of
  // the TR element, so the tester sees all physical outputs that must operate.
  const coilGroups = new Map<string, { contacts: string[]; ops: string[] }>();
  for (const [outId, expr] of contacts) {
    if (DISABLED_EXPR_RE.test(expr)) continue;   // OUT104 = 0 → not displayed
    const ops = signalsInExpr(expr);
    const routedCoil = ops.length === 1 &&
      (graph.nodes.has(ops[0]) || COIL_IDS.has(ops[0].toUpperCase()))
      ? ops[0] : null;
    const key = routedCoil ?? `__solo_${outId}`;
    if (!coilGroups.has(key)) coilGroups.set(key, { contacts: [], ops: [] });
    const g = coilGroups.get(key)!;
    g.contacts.push(outId);
    for (const op of ops) if (!g.ops.includes(op)) g.ops.push(op);
  }

  for (const [key, g] of coilGroups) {
    const routedCoil = key.startsWith('__solo_') ? null : key;
    const cone = upstreamClosure(graph, g.ops, boundary);
    for (const c of g.contacts) cone.add(c);
    for (const id of cone) usedSignalIds.add(id);

    const anchor = g.contacts[0];
    const soloPurpose = coilPurpose(g.contacts[0]);
    const label = routedCoil
      ? `${coilPurpose(routedCoil)} — ${g.contacts.join(' / ')} / ${routedCoil}`
      : soloPurpose !== 'Output' && soloPurpose !== g.contacts[0]
        ? `${soloPurpose} — ${g.contacts[0]}`        // e.g. "Alarm — ALRMOUT"
        : `${g.contacts[0]} Logic`;

    areas.push({
      id: `area_${anchor}`,
      label,
      kind: 'output',
      rootIds: routedCoil ? [...g.contacts, routedCoil] : [...g.contacts],
      nodeIds: [...cone],
    });
  }

  // ── 2. Coils not routed by any contact get their own area ────────────────
  for (const [id, node] of graph.nodes) {
    const isCoil = node.isOutput || COIL_IDS.has(id.toUpperCase());
    if (!isCoil) continue;
    if (routedCoils.has(id)) continue;           // already inside a contact area
    if (/^OUT\d+$/i.test(id)) continue;          // contact itself, handled above
    if (node.dependencies.length === 0) continue; // not driven
    if (areas.some(a => a.rootIds.includes(id))) continue;
    // Skip coils already displayed inside another window's cone (e.g. TR lives
    // upstream of TRIP in the merged Trip window — no second window).
    if (areas.some(a => a.nodeIds.includes(id))) continue;

    const cone = upstreamClosure(graph, [id], boundary);
    for (const s of cone) usedSignalIds.add(s);
    areas.push({
      id: `area_${id}`,
      label: `${coilPurpose(id)} — ${id}`,
      kind: 'output',
      rootIds: [id],
      nodeIds: [...cone],
    });
  }

  // ── 3. Recloser (79*) logic joins the Close window ────────────────────────
  // The 79 scheme equations (79RI, 79RIS, 79DTL, 79DLS, 79STL, …) belong with
  // the close logic the tester proves, not scattered in their own windows.
  const closeArea = areas.find(a =>
    a.rootIds.some(r => /^(CL|CLOSE)$/i.test(r)) ||
    a.nodeIds.some(id => /^(CL|CLOSE)$/i.test(id)),
  );
  if (closeArea) {
    const closeSet = new Set(closeArea.nodeIds);
    for (const [id, node] of graph.nodes) {
      if (!/^79/.test(id)) continue;
      if (!node.equation || DISABLED_EXPR_RE.test(node.equation.expression)) continue;
      for (const s of upstreamClosure(graph, [id], boundary)) {
        closeSet.add(s);
        usedSignalIds.add(s);
      }
    }
    closeArea.nodeIds = [...closeSet];
  }

  // ── 4. SV areas — every SV programmed with real logic (equation ≠ 0) ──────
  const svNumbers = new Set<string>();
  for (const id of graph.nodes.keys()) {
    const m = id.match(/^SV(\d+)[SRT]?$/i);
    if (m) svNumbers.add(m[1]);
  }
  for (const n of includeSv ? svNumbers : []) {
    const bit = `SV${n}`;
    const timed = `SV${n}T`;
    const bitNode = graph.nodes.get(bit);
    const setNode = graph.nodes.get(`SV${n}S`);
    // Live = the SV variable (or its set equation) is programmed, not "0".
    const live = (nd?: { equation?: { expression: string } }) =>
      !!nd?.equation && !DISABLED_EXPR_RE.test(nd.equation.expression);
    if (!live(bitNode) && !live(setNode)) continue;

    const starts = [timed, bit, `SV${n}S`, `SV${n}R`].filter(id => graph.nodes.has(id));
    const cone = upstreamClosure(graph, starts, boundary);
    cone.add(bit);
    for (const s of cone) usedSignalIds.add(s);
    areas.push({
      id: `area_SV${n}`,
      label: graph.nodes.has(timed)
        ? `SV${n} → SV${n}T — PU/DO timed`
        : `SV${n} — Set / Reset + PU/DO`,
      kind: 'sv',
      rootIds: graph.nodes.has(timed) ? [timed, bit] : [bit],
      nodeIds: [...cone],
    });
  }

  // ── 5. LT latch windows — one per synthesized latch bit (behind a toggle) ─
  if (includeLt) {
    for (const [id, node] of graph.nodes) {
      if (node.synthetic !== 'latch') continue;
      const cone = upstreamClosure(graph, [id], boundary);
      for (const s of cone) usedSignalIds.add(s);
      areas.push({
        id: `area_${id}`,
        label: `${id} — Latch (SET / RST)`,
        kind: 'lt',
        rootIds: [id],
        nodeIds: [...cone],
      });
    }
  }

  // ── 6. LED & PB areas (optional, behind a toggle) ────────────────────────
  if (opts.includeLedPb) {
    for (const led of extractEnabledLeds(relay)) {
      const cone = upstreamClosure(graph, signalsInExpr(led.expression), boundary);
      cone.add(led.id);
      areas.push({
        id: `area_${led.id}`,
        label: `${led.id}${led.note ? ' — ' + led.note : ''}`,
        kind: 'led',
        rootIds: [led.id],
        nodeIds: [...cone],
      });
    }
    for (const pb of extractEnabledPushbuttons(relay)) {
      const cone = upstreamClosure(graph, signalsInExpr(pb.expression), boundary);
      cone.add(pb.id);
      areas.push({
        id: `area_${pb.id}`,
        label: `${pb.id}${pb.note ? ' — ' + pb.note : ''}`,
        kind: 'pb',
        rootIds: [pb.id],
        nodeIds: [...cone],
      });
    }
  }

  return { areas, usedSignalIds };
}

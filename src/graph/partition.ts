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

export type AreaKind = 'output' | 'sv' | 'led' | 'pb';

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

const COIL_IDS = new Set(['TR', 'TRIP', 'CL', 'CLOSE', 'ALARM']);

// An output expression that drives nothing (e.g. "OUT104 = 0", "NA", blank).
const DISABLED_EXPR_RE = /^\s*(|0|NA|N\/A|OFF|N|NONE)\s*$/i;

function coilPurpose(id: string): string {
  const u = id.toUpperCase();
  if (/^(TR|TRIP)$/.test(u)) return 'Trip';
  if (/^(CL|CLOSE)$/.test(u)) return 'Close';
  if (/^ALARM/.test(u)) return 'Alarm';
  if (/^OUT/.test(u)) return 'Output';
  return id;
}

/** Signals directly referenced in a SELogic expression. */
function signalsInExpr(expr: string): string[] {
  const ast = parseExpression(expr);
  if (!ast) return [];
  return Array.from(collectSignals(ast));
}

/** Upstream closure over `dependencies`. Includes the start ids themselves. */
function upstreamClosure(graph: DependencyGraph, starts: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...starts];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = graph.nodes.get(id);
    if (n) for (const d of n.dependencies) if (!seen.has(d)) stack.push(d);
  }
  return seen;
}

// ─── Main entry ─────────────────────────────────────────────────────────────

export interface PartitionOptions {
  /** Include LED and front-panel PB areas (default false). */
  includeLedPb?: boolean;
}

export function partitionGraph(
  graph: DependencyGraph,
  relay: ParsedRelaySettings | null,
  opts: PartitionOptions = {},
): PartitionResult {
  const contacts = parseOutputContacts(relay); // Map<OUTxxx, expr>
  const areas: LogicArea[] = [];
  const usedSignalIds = new Set<string>();

  // Coils that a contact routes 1:1 (so we don't also emit a standalone area).
  const routedCoils = new Set<string>();
  for (const [, expr] of contacts) {
    const ops = signalsInExpr(expr);
    if (ops.length === 1 && (graph.nodes.has(ops[0]) || COIL_IDS.has(ops[0].toUpperCase()))) {
      routedCoils.add(ops[0]);
    }
  }

  // ── 1. One area per *driven* output contact ──────────────────────────────
  for (const [outId, expr] of contacts) {
    if (DISABLED_EXPR_RE.test(expr)) continue;   // OUT104 = 0 → not displayed
    const ops = signalsInExpr(expr);
    const cone = upstreamClosure(graph, ops);
    cone.add(outId);
    for (const id of cone) usedSignalIds.add(id);

    const routedCoil = ops.length === 1 ? ops[0] : null;
    const label = routedCoil
      ? `${coilPurpose(routedCoil)} — ${outId} / ${routedCoil}`
      : `${outId} Logic`;

    areas.push({
      id: `area_${outId}`,
      label,
      kind: 'output',
      rootIds: routedCoil ? [outId, routedCoil] : [outId],
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

    const cone = upstreamClosure(graph, [id]);
    for (const s of cone) usedSignalIds.add(s);
    areas.push({
      id: `area_${id}`,
      label: `${coilPurpose(id)} — ${id}`,
      kind: 'output',
      rootIds: [id],
      nodeIds: [...cone],
    });
  }

  // ── 3. SV areas — only SVs actually used by other logic ──────────────────
  const svNumbers = new Set<string>();
  for (const id of graph.nodes.keys()) {
    const m = id.match(/^SV(\d+)[SRT]?$/i);
    if (m) svNumbers.add(m[1]);
  }
  for (const n of svNumbers) {
    const bit = `SV${n}`;
    const setEq = `SV${n}S`;
    const rstEq = `SV${n}R`;
    // "Used in other logic" = the SV bit is referenced inside an output cone.
    const isUsed = usedSignalIds.has(bit) || usedSignalIds.has(`SV${n}T`);
    if (!isUsed) continue;
    const starts = [bit, setEq, rstEq].filter(id => graph.nodes.has(id) || id === bit);
    const cone = upstreamClosure(graph, starts);
    cone.add(bit);
    areas.push({
      id: `area_SV${n}`,
      label: `SV${n} — Set / Reset + PU/DO`,
      kind: 'sv',
      rootIds: [bit],
      nodeIds: [...cone],
    });
  }

  // ── 4. LED & PB areas (optional, behind a toggle) ────────────────────────
  if (opts.includeLedPb) {
    for (const led of extractEnabledLeds(relay)) {
      const cone = upstreamClosure(graph, signalsInExpr(led.expression));
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
      const cone = upstreamClosure(graph, signalsInExpr(pb.expression));
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

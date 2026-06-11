/**
 * @module graph/areaLayout
 * Area-aware React Flow layout: partitions the graph into logic windows, builds
 * each area's subgraph with the existing pipeline, then wraps it in a draggable
 * React Flow group (parent) node. Child node ids are namespaced `areaId::signalId`
 * so a shared signal can appear in several areas while staying state-synced
 * (every instance keeps `data.nodeId` = the logical id; see `buildReactFlow.ts`).
 */

import type { Node, Edge } from 'reactflow';
import type { DependencyGraph } from '../selogic/graph';
import type { ParsedRelaySettings } from '../relay-adapters/common/types';
import type { SignalStates } from './propagate';
import { buildReactFlowLayout } from './buildReactFlow';
import { nodeSizeForType } from './layout';
import { partitionGraph, type LogicArea, type AreaKind } from './partition';

// ─── Layout constants ─────────────────────────────────────────────────────────

const HEADER_H = 38;
const PAD = 24;
const GAP_X = 90;
const GAP_Y = 90;
const MAX_ROW_W = 4200;

export interface LogicAreaNodeData {
  label: string;
  kind: AreaKind;
  areaId: string;
  width: number;
  height: number;
}

export interface AreaBuildOptions {
  includeLedPb?: boolean;
  includeSv?: boolean;
  includeLt?: boolean;
  hiddenAreaIds?: Set<string>;
}

/** Bounding box of a set of laid-out nodes (using per-type sizes). */
function contentBBox(nodes: Node[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const { width, height } = nodeSizeForType(n.type ?? 'default');
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + width);
    maxY = Math.max(maxY, n.position.y + height);
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 160; maxY = 80; }
  return { minX, minY, maxX, maxY };
}

/**
 * Build the full area-partitioned React Flow node/edge arrays.
 * Group (frame) nodes precede their children so React Flow nests them correctly.
 */
export function buildAreaLayout(
  graph: DependencyGraph,
  relay: ParsedRelaySettings | null,
  signalStates: SignalStates,
  onToggle: (nodeId: string, value: 0 | 1) => void,
  opts: AreaBuildOptions = {},
): { nodes: Node[]; edges: Edge[]; areas: LogicArea[] } {
  const hidden = opts.hiddenAreaIds ?? new Set<string>();
  const { areas } = partitionGraph(graph, relay, {
    includeLedPb: opts.includeLedPb,
    includeSv: opts.includeSv,
    includeLt: opts.includeLt,
  });

  const outNodes: Node[] = [];
  const outEdges: Edge[] = [];

  let cursorX = 0, cursorY = 0, rowMaxH = 0;

  for (const area of areas) {
    if (hidden.has(area.id)) continue;

    const nodeSet = new Set(area.nodeIds);
    const { nodes: localNodes, edges: localEdges } =
      buildReactFlowLayout(graph, relay, signalStates, onToggle, nodeSet);
    if (localNodes.length === 0) continue;

    const bbox = contentBBox(localNodes);
    const contentW = bbox.maxX - bbox.minX;
    const contentH = bbox.maxY - bbox.minY;
    const boxW = contentW + PAD * 2;
    const boxH = contentH + HEADER_H + PAD * 2;

    // Grid packing (initial positions; user drags + persistence take over after).
    if (cursorX > 0 && cursorX + boxW > MAX_ROW_W) {
      cursorX = 0;
      cursorY += rowMaxH + GAP_Y;
      rowMaxH = 0;
    }
    const originX = cursorX;
    const originY = cursorY;

    // Group / frame node (parent) — must come before its children.
    outNodes.push({
      id: area.id,
      type: 'logicAreaNode',
      position: { x: originX, y: originY },
      draggable: true,
      selectable: true,
      connectable: false,
      style: { width: boxW, height: boxH },
      zIndex: 0,
      data: {
        label: area.label,
        kind: area.kind,
        areaId: area.id,
        width: boxW,
        height: boxH,
      } as LogicAreaNodeData,
    });

    // Children: namespaced ids, positioned relative to the parent.
    for (const n of localNodes) {
      outNodes.push({
        ...n,
        id: `${area.id}::${n.id}`,
        parentNode: area.id,
        extent: 'parent',
        position: {
          x: (n.position.x - bbox.minX) + PAD,
          y: (n.position.y - bbox.minY) + HEADER_H + PAD,
        },
        zIndex: 1,
      });
    }
    for (const e of localEdges) {
      outEdges.push({
        ...e,
        id: `${area.id}::${e.id}`,
        source: `${area.id}::${e.source}`,
        target: `${area.id}::${e.target}`,
        zIndex: 1,
      });
    }

    cursorX += boxW + GAP_X;
    rowMaxH = Math.max(rowMaxH, boxH);
  }

  return { nodes: outNodes, edges: outEdges, areas };
}

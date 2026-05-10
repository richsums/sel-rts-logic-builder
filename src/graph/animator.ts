/**
 * @module graph/animator
 * Builds a time-ordered sequence of animation events from a state diff.
 * Pure function — no React or DOM dependencies.
 */

import type { DependencyGraph } from '../selogic/graph';
import type { SignalStates } from './propagate';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnimEventType =
  | 'node-flash'    // node colour transitions (generic)
  | 'edge-pulse'    // edge carries a new value
  | 'trip-ripple'   // TR/TRIP node special animation
  | 'blocked';      // downstream AND gate blocked by NOT signal going high

export interface AnimationEvent {
  id: string;
  type: AnimEventType;
  /** Node ID (for node events) or `${source}->${target}` (for edge events). */
  target: string;
  from: 0 | 1;
  to: 0 | 1;
  /** Milliseconds from the start of the animation sequence. */
  timestamp: number;
  /** Duration of the animation in milliseconds. */
  duration: number;
}

// ─── Speed scaling ────────────────────────────────────────────────────────────

export const SPEED_SCALE: Record<'slow' | 'normal' | 'fast', number> = {
  slow:   2.0,
  normal: 1.0,
  fast:   0.4,
};

const BASE_DURATIONS = {
  nodeFlash:  150,   // ms per node flash
  edgePulse:  200,   // ms per edge pulse
  hopStagger: 100,   // ms between topological levels
  tripRipple: 600,   // ms for trip ripple animation
};

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Build a sorted list of animation events from old→new signal states.
 *
 * Events are generated in topological order with a configurable stagger
 * between levels so the user can see the propagation front sweep through
 * the graph.
 *
 * @param oldStates    States before the toggle
 * @param newStates    States after full propagation
 * @param sortedOrder  Nodes in topological order (from topologicalSort)
 * @param graph        Dependency graph for edge generation
 * @param speed        Animation speed multiplier
 */
export function buildAnimationSequence(
  oldStates: SignalStates,
  newStates: SignalStates,
  sortedOrder: string[],
  graph: DependencyGraph,
  speed: 'slow' | 'normal' | 'fast' = 'normal',
): AnimationEvent[] {
  const scale = SPEED_SCALE[speed];
  const events: AnimationEvent[] = [];
  let counter = 0;

  // Map each node to its topological level for stagger timing
  const levelOf = new Map<string, number>();
  for (let i = 0; i < sortedOrder.length; i++) levelOf.set(sortedOrder[i], i);

  for (const id of sortedOrder) {
    const oldVal = oldStates[id] ?? 0;
    const newVal = newStates[id] ?? 0;
    if (oldVal === newVal) continue;

    const level   = levelOf.get(id) ?? 0;
    const baseT   = level * BASE_DURATIONS.hopStagger * scale;
    const isTrip  = id === 'TR' || id === 'TRIP';

    // Node event
    events.push({
      id:        `node-${id}-${counter++}`,
      type:      isTrip && newVal === 1 ? 'trip-ripple' : 'node-flash',
      target:    id,
      from:      oldVal,
      to:        newVal,
      timestamp: baseT,
      duration:  (isTrip ? BASE_DURATIONS.tripRipple : BASE_DURATIONS.nodeFlash) * scale,
    });

    // Edge events — one per outgoing edge from this node
    const node = graph.nodes.get(id);
    if (node) {
      const edgeT = baseT + BASE_DURATIONS.nodeFlash * scale * 0.5;
      for (const depId of node.dependents) {
        events.push({
          id:        `edge-${id}-${depId}-${counter++}`,
          type:      'edge-pulse',
          target:    `${id}->${depId}`,
          from:      oldVal,
          to:        newVal,
          timestamp: edgeT,
          duration:  BASE_DURATIONS.edgePulse * scale,
        });

        // Check if this edge feeds into a NOT path (blocking scenario)
        const depNode = graph.nodes.get(depId);
        if (depNode?.equation) {
          const expr = depNode.equation.expression.toUpperCase();
          if (expr.includes(`!${id.toUpperCase()}`) && newVal === 1) {
            events.push({
              id:        `blocked-${depId}-${counter++}`,
              type:      'blocked',
              target:    depId,
              from:      0,
              to:        1,
              timestamp: edgeT + BASE_DURATIONS.edgePulse * scale,
              duration:  BASE_DURATIONS.nodeFlash * scale * 2,
            });
          }
        }
      }
    }
  }

  events.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  return events;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Total duration of an animation sequence in milliseconds. */
export function sequenceDuration(events: AnimationEvent[]): number {
  if (events.length === 0) return 0;
  const last = events[events.length - 1];
  return last.timestamp + last.duration;
}

/** Filter events to just the node-level events (not edges). */
export function nodeEvents(events: AnimationEvent[]): AnimationEvent[] {
  return events.filter(e => e.type !== 'edge-pulse');
}

/** Filter events to just the edge-level events. */
export function edgeEvents(events: AnimationEvent[]): AnimationEvent[] {
  return events.filter(e => e.type === 'edge-pulse');
}

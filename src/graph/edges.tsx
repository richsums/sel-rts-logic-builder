/**
 * @module graph/edges
 * Custom React Flow edge type for animated logic propagation.
 * Shows flowing dashes in green (carrying 1), gray (carrying 0),
 * or amber (NOT/inverter edges).
 */

import React from 'react';
import {
  getBezierPath,
  type EdgeProps,
} from 'reactflow';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnimatedLogicEdgeData {
  /** Logical state carried by this edge (0 or 1). */
  state: 0 | 1;
  /** True if this is a NOT (inverter) edge — amber colouring. */
  isNot: boolean;
  /** True while an animation pulse is travelling along this edge. */
  pulsing: boolean;
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

function edgeColor(state: 0 | 1, isNot: boolean, pulsing: boolean): string {
  if (pulsing) return '#ffffff';
  if (isNot)   return state === 1 ? '#f97316' : '#fbbf24'; // amber for NOT
  return state === 1 ? '#00ff88' : '#94a3b8';              // green / gray
}

function strokeWidth(state: 0 | 1, isNot: boolean): number {
  if (isNot)       return 1.5;
  return state === 1 ? 2.5 : 1.5;
}

// ─── AnimatedLogicEdge ────────────────────────────────────────────────────────

export function AnimatedLogicEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  data,
  markerEnd,
}: EdgeProps<AnimatedLogicEdgeData>) {
  const state   = data?.state   ?? 0;
  const isNot   = data?.isNot   ?? false;
  const pulsing = data?.pulsing ?? false;

  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const color = edgeColor(state, isNot, pulsing);
  const sw    = strokeWidth(state, isNot);

  // Flowing dash animation when carrying state=1 or during pulse
  const animationId = `dash-${id}`;
  const dashLen  = state === 1 ? 8  : 5;
  const gapLen   = state === 1 ? 6  : 12;
  const duration = state === 1 ? '0.6s' : '1.2s';

  return (
    <>
      <style>{`
        @keyframes ${animationId} {
          to { stroke-dashoffset: -${dashLen + gapLen}; }
        }
      `}</style>

      {/* Background path (subtle track) */}
      <path
        d={edgePath}
        strokeWidth={sw + 1}
        stroke="#e2e8f0"
        fill="none"
        opacity={0.5}
      />

      {/* Animated dashes */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeDasharray={`${dashLen} ${gapLen}`}
        strokeDashoffset={0}
        style={{
          animation:    state === 1 || pulsing ? `${animationId} ${duration} linear infinite` : 'none',
          transition:   'stroke 0.2s ease, stroke-width 0.2s ease',
          opacity:      state === 0 && !pulsing ? 0.4 : 1,
        }}
        markerEnd={markerEnd}
      />

      {/* Pulse surge overlay (bright white flash travelling along edge) */}
      {pulsing && (
        <path
          d={edgePath}
          fill="none"
          stroke="white"
          strokeWidth={sw + 2}
          strokeDasharray={`${dashLen * 2} 100`}
          strokeLinecap="round"
          style={{ animation: `${animationId} 0.3s linear forwards`, opacity: 0.9 }}
        />
      )}
    </>
  );
}

export const EDGE_TYPES = {
  animatedLogic: AnimatedLogicEdge,
};

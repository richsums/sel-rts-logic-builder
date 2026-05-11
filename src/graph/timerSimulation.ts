/**
 * @module graph/timerSimulation
 * Pure timer state machine for SEL protection element TC (timer-counter) nodes.
 *
 * Every timed protection element (51x, 67x, 21P2+, 79x) uses a three-node chain:
 *   [Pickup P] → [Timer TC] → [Trip word bit T]
 *
 * The TC node animates:
 *   - A clockwise arc filling over real PU time (capped at 5 s display; badge if faster)
 *   - A countdown "2.34 s remaining…" during timing
 *   - On PU complete: white surge pulse along TC → T edge, T asserts
 *   - On pickup drop while timing: cancel and reset arc
 *   - On pickup drop after trip: start DO timer draining arc 1.0→0, then de-assert T
 *
 * This module is pure (no React, no DOM) — safe for tests and workers.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Lifecycle phase of a single timer-counter node. */
export type TimerPhase =
  | 'idle'        // pickup not asserted; arc at 0
  | 'timing-pu'   // pickup asserted, PU timer counting up
  | 'tripped'     // PU complete, T-bit asserted, arc full
  | 'timing-do'   // pickup dropped after trip, DO timer draining arc
  | 'done';       // DO complete, T-bit de-asserted, arc at 0 (transitions to idle)

/** Visual edge animation style for the two TC-related edges. */
export type EdgeAnimStyle =
  | 'idle'          // no animation; static gray
  | 'amber-dashes'  // P→TC edge while PU timing; dashed amber
  | 'white-surge'   // TC→T edge on trip assertion moment
  | 'green-flowing' // both edges after trip; solid green flowing dashes
  | 'gray-drain';   // P→TC edge during DO (draining right-to-left)

/** Immutable snapshot of a single TC node's runtime state. */
export interface TimerState {
  /** Node ID, e.g. '51P1TC'. */
  nodeId: string;
  /** Current phase. */
  phase: TimerPhase;
  /** PU time in seconds (from relay settings). */
  puSeconds: number;
  /** DO time in seconds (from relay settings). */
  doSeconds: number;
  /** Elapsed ms since the current phase started. */
  elapsedMs: number;
  /** Arc fill progress 0 → 1 (PU fills; DO drains). */
  progress: number;
  /**
   * Display speed multiplier.
   * When puSeconds > 5, the arc animates at 5× speed and a '5×' badge is shown.
   */
  speedMult: number;
  /** Short countdown / status text shown on the node card. Empty when idle/done. */
  countdownText: string;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a fresh idle TimerState for the given TC node.
 */
export function createTimerState(
  nodeId: string,
  puSeconds: number,
  doSeconds: number,
): TimerState {
  return {
    nodeId,
    phase: 'idle',
    puSeconds,
    doSeconds,
    elapsedMs: 0,
    progress: 0,
    speedMult: puSeconds > 5 ? 5 : 1,
    countdownText: '',
  };
}

// ─── State transitions ────────────────────────────────────────────────────────

/**
 * Start the PU timer (call when pickup bit asserts).
 * No-op if already timing or tripped.
 */
export function startPickupTimer(state: TimerState): TimerState {
  if (state.phase === 'timing-pu' || state.phase === 'tripped') return state;
  return {
    ...state,
    phase: 'timing-pu',
    elapsedMs: 0,
    progress: 0,
    countdownText: `${state.puSeconds.toFixed(2)} s remaining…`,
  };
}

/**
 * Handle pickup drop:
 *   - If still timing PU → cancel, reset arc to idle.
 *   - If already tripped → start DO drain timer.
 *   - Otherwise → no-op.
 */
export function dropPickup(state: TimerState): TimerState {
  if (state.phase === 'timing-pu') {
    return { ...state, phase: 'idle', elapsedMs: 0, progress: 0, countdownText: '' };
  }
  if (state.phase === 'tripped') {
    return {
      ...state,
      phase: 'timing-do',
      elapsedMs: 0,
      progress: 1.0,
      countdownText: 'dropout…',
    };
  }
  return state;
}

/**
 * Force-reset to idle regardless of current phase.
 */
export function resetTimer(state: TimerState): TimerState {
  return { ...state, phase: 'idle', elapsedMs: 0, progress: 0, countdownText: '' };
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

/**
 * Advance the timer by `deltaMs` milliseconds.
 * Called at ~60 fps from a setInterval; returns a new immutable state.
 *
 * PU phase:  arc fills from 0→1 over puSeconds. If puSeconds > 5, arc animates
 *            at speedMult× so it completes in ≤ 5 s of wall-clock time.
 * DO phase:  arc drains from 1→0 over doSeconds.
 */
export function tickTimer(state: TimerState, deltaMs: number): TimerState {
  if (state.phase !== 'timing-pu' && state.phase !== 'timing-do') return state;

  const newElapsed = state.elapsedMs + deltaMs;

  if (state.phase === 'timing-pu') {
    const totalMs = state.puSeconds * 1000;
    // progress tracks real elapsed fraction (not display speed)
    const progress = Math.min(newElapsed / totalMs, 1.0);
    const isDone = newElapsed >= totalMs;

    if (isDone) {
      return {
        ...state,
        phase: 'tripped',
        elapsedMs: totalMs,
        progress: 1.0,
        countdownText: '',
      };
    }

    const remaining = (totalMs - newElapsed) / 1000;
    return {
      ...state,
      elapsedMs: newElapsed,
      progress,
      countdownText: `${remaining.toFixed(2)} s remaining…`,
    };
  }

  // timing-do: drain arc from 1 → 0 over doSeconds
  const totalMs = state.doSeconds * 1000;
  const progress = Math.max(0, 1.0 - newElapsed / totalMs);
  const isDone = newElapsed >= totalMs;

  if (isDone) {
    return {
      ...state,
      phase: 'done',
      elapsedMs: totalMs,
      progress: 0,
      countdownText: '',
    };
  }

  return {
    ...state,
    elapsedMs: newElapsed,
    progress,
    countdownText: 'dropout…',
  };
}

// ─── Edge style helpers ───────────────────────────────────────────────────────

/**
 * Edge animation style for the Pickup → TC edge.
 *
 * - idle      → static gray (no animation)
 * - timing-pu → amber dashes flowing right, floating "timing…" badge
 * - tripped   → green flowing dashes
 * - timing-do → gray dashes draining right-to-left, "dropout…" badge
 * - done      → static gray (transitions to idle next cycle)
 */
export function pickupToTcEdgeStyle(phase: TimerPhase): EdgeAnimStyle {
  switch (phase) {
    case 'timing-pu': return 'amber-dashes';
    case 'tripped':   return 'green-flowing';
    case 'timing-do': return 'gray-drain';
    default:          return 'idle';
  }
}

/**
 * Edge animation style for the TC → Trip word bit edge.
 *
 * - idle / timing-pu → static gray (trip not yet asserted)
 * - tripped (first frame) → white-surge (one-shot surge pulse; caller handles timing)
 * - tripped (subsequent)  → green flowing dashes
 * - timing-do → gray drain (de-assertion propagating)
 * - done      → static gray
 */
export function tcToTripEdgeStyle(phase: TimerPhase): EdgeAnimStyle {
  switch (phase) {
    case 'tripped':   return 'green-flowing';
    case 'timing-do': return 'gray-drain';
    default:          return 'idle';
  }
}

/**
 * Returns true when the timer just completed PU (phase === 'tripped' AND progress === 1.0
 * with no elapsed time on the tripped phase). Callers should emit the white-surge
 * pulse animation on the TC → T edge at this moment.
 */
export function isTripMoment(prev: TimerPhase, next: TimerPhase): boolean {
  return prev === 'timing-pu' && next === 'tripped';
}

/**
 * Returns true when the DO timer just completed (phase transitions to 'done').
 * Callers should emit a de-assertion gray pulse on the T edge at this moment.
 */
export function isDeMoment(prev: TimerPhase, next: TimerPhase): boolean {
  return prev === 'timing-do' && next === 'done';
}

// ─── Arc display helpers ──────────────────────────────────────────────────────

/**
 * Returns the arc fill progress [0, 1] to drive the clockwise SVG arc.
 * When running at speedMult > 1, the visual arc fills faster than real time;
 * the actual elapsedMs is still tracked in real time for correct trip timing.
 */
export function arcProgress(state: TimerState): number {
  if (state.phase === 'timing-pu') {
    // Display at speedMult× but clamp to 1
    const displayMs = state.elapsedMs * state.speedMult;
    const totalMs   = state.puSeconds * 1000;
    return Math.min(displayMs / totalMs, 1.0);
  }
  return state.progress;
}

/**
 * Returns a short human-readable badge label for the node card.
 * Empty string when no badge should be shown.
 */
export function timerBadgeLabel(state: TimerState): string {
  if (state.phase === 'timing-pu' && state.speedMult > 1) {
    return `${state.speedMult}×`;
  }
  return '';
}

/**
 * @module store/ui
 * Zustand store for UI state including:
 *  - Active tab navigation
 *  - Graph layout persistence (node positions, edges, viewport)
 *  - Logic simulation state (signal states, animation speed)
 *  - Notifications
 *  - Script revision history (undo/redo)
 */

import { create } from 'zustand';
import type { Node, Edge, Viewport } from 'reactflow';
import type { SignalStates } from '../graph/propagate';
import type { TimerState } from '../graph/timerSimulation';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActiveTab = 'import' | 'settings' | 'graph' | 'scripts' | 'review' | 'export';
export type AnimationSpeed = 'slow' | 'normal' | 'fast';

export interface UIState {
  // ── Tab navigation ────────────────────────────────────────────────────────
  activeTab: ActiveTab;
  selectedScriptId: string | null;
  /** Script ID to navigate to when Review mounts (set by Graph double-click). */
  reviewJumpScriptId: string | null;
  graphLayoutDone: boolean;
  notification: { type: 'success' | 'error' | 'info'; message: string } | null;

  // ── Graph state persistence ───────────────────────────────────────────────
  /** Stored React Flow nodes (positions, data). Persists across tab changes. */
  graphNodes: Node[];
  /** Stored React Flow edges. Persists across tab changes. */
  graphEdges: Edge[];
  /** Stored viewport (zoom + pan). */
  graphViewport: Viewport;
  /** Project ID that owns the current stored graph layout. */
  graphProjectId: string | null;

  // ── Logic simulation ──────────────────────────────────────────────────────
  /** Current logical state of every signal in the active graph. */
  signalStates: SignalStates;
  /** Animation speed for propagation cascade. */
  animationSpeed: AnimationSpeed;
  /** Number of nodes affected by the most recent toggle. */
  lastChangeCount: number;
  /** IDs of edges that are currently pulsing (animation in flight). */
  pulsingEdgeIds: string[];
  /** nodeId → animState string for flashing nodes. */
  flashingNodes: Record<string, string>;
  /** TC node ID → TimerState for all active timers. */
  timerStates: Record<string, TimerState>;

  // ── Script revision history ───────────────────────────────────────────────
  /** scriptId → content history stack */
  scriptRevisions: Record<string, string[]>;
  /** scriptId → current index into history stack */
  scriptRevisionIdx: Record<string, number>;

  // ── Actions ───────────────────────────────────────────────────────────────
  setActiveTab: (tab: ActiveTab) => void;
  setSelectedScript: (id: string | null) => void;
  setReviewJumpScript: (id: string | null) => void;
  setGraphLayoutDone: (done: boolean) => void;
  showNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  clearNotification: () => void;

  /** Persist the current React Flow layout back to the store. */
  saveGraphLayout: (nodes: Node[], edges: Edge[], viewport: Viewport, projectId: string) => void;
  /** Overwrite stored graph layout (used after Reset Graph). */
  setGraphLayout: (nodes: Node[], edges: Edge[], projectId: string) => void;
  /** Clear stored layout for the given project (forces recompute on next mount). */
  clearGraphLayout: (projectId: string) => void;

  /** Replace signal states (called after propagation). */
  setSignalStates: (states: SignalStates) => void;
  /** Reset all signals to 0. */
  resetSignalStates: () => void;
  /** Set animation speed. */
  setAnimationSpeed: (speed: AnimationSpeed) => void;
  /** Record how many nodes were affected by the last toggle. */
  setLastChangeCount: (count: number) => void;
  /** Mark edges as pulsing. */
  setPulsingEdgeIds: (ids: string[]) => void;
  /** Mark nodes as flashing with anim states. */
  setFlashingNodes: (nodes: Record<string, string>) => void;
  /** Clear all animation state. */
  clearAnimations: () => void;
  /** Update a single timer state. */
  setTimerState: (nodeId: string, state: TimerState) => void;
  /** Clear all timer states (called on relay switch). */
  clearTimerStates: () => void;

  /** Push a new revision onto the history stack for a script. */
  pushRevision: (scriptId: string, content: string) => void;
  /** Undo: return previous content or null if at start of history. */
  undoRevision: (scriptId: string) => string | null;
  /** Redo: return next content or null if at end of history. */
  redoRevision: (scriptId: string) => string | null;
  /** Return true if undo is available for a script. */
  canUndo: (scriptId: string) => boolean;
  /** Return true if redo is available for a script. */
  canRedo: (scriptId: string) => boolean;
}

// ─── Default viewport ─────────────────────────────────────────────────────────

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 0.8 };

// ─── Store ────────────────────────────────────────────────────────────────────

export const useUIStore = create<UIState>((set, get) => ({
  // Tab navigation
  activeTab:           'import',
  selectedScriptId:    null,
  reviewJumpScriptId:  null,
  graphLayoutDone:     false,
  notification:        null,

  // Graph state
  graphNodes:     [],
  graphEdges:     [],
  graphViewport:  DEFAULT_VIEWPORT,
  graphProjectId: null,

  // Simulation state
  signalStates:    {},
  animationSpeed:  'normal',
  lastChangeCount: 0,
  pulsingEdgeIds:  [],
  flashingNodes:   {},
  timerStates:     {},

  // Revision history
  scriptRevisions:   {},
  scriptRevisionIdx: {},

  // ── Tab actions ────────────────────────────────────────────────────────────
  setActiveTab:         (tab) => set({ activeTab: tab }),
  setSelectedScript:    (id)  => set({ selectedScriptId: id }),
  setReviewJumpScript:  (id)  => set({ reviewJumpScriptId: id }),
  setGraphLayoutDone:   (done) => set({ graphLayoutDone: done }),
  showNotification:     (type, message) => set({ notification: { type, message } }),
  clearNotification:    ()    => set({ notification: null }),

  // ── Graph layout actions ───────────────────────────────────────────────────
  saveGraphLayout: (nodes, edges, viewport, projectId) =>
    set({ graphNodes: nodes, graphEdges: edges, graphViewport: viewport, graphProjectId: projectId }),

  setGraphLayout: (nodes, edges, projectId) =>
    set({ graphNodes: nodes, graphEdges: edges, graphProjectId: projectId }),

  clearGraphLayout: (projectId) =>
    set(state =>
      state.graphProjectId === projectId
        ? { graphNodes: [], graphEdges: [], graphProjectId: null }
        : {}
    ),

  // ── Simulation actions ────────────────────────────────────────────────────
  setSignalStates:    (states) => set({ signalStates: states }),
  resetSignalStates:  ()       => set({ signalStates: {} }),
  setAnimationSpeed:  (speed)  => set({ animationSpeed: speed }),
  setLastChangeCount: (count)  => set({ lastChangeCount: count }),
  setPulsingEdgeIds:  (ids)    => set({ pulsingEdgeIds: ids }),
  setFlashingNodes:   (nodes)  => set({ flashingNodes: nodes }),
  clearAnimations:    ()       => set({ pulsingEdgeIds: [], flashingNodes: {} }),
  setTimerState:  (nodeId, state) => set(s => ({ timerStates: { ...s.timerStates, [nodeId]: state } })),
  clearTimerStates:   ()       => set({ timerStates: {} }),

  // ── Revision history actions ───────────────────────────────────────────────
  pushRevision: (scriptId, content) => {
    const s = get();
    const hist  = s.scriptRevisions[scriptId] ?? [];
    const idx   = s.scriptRevisionIdx[scriptId] ?? hist.length - 1;
    // Truncate any forward history
    const base  = hist.slice(0, Math.max(0, idx + 1));
    // Skip if content unchanged
    if (base[base.length - 1] === content) return;
    const next  = [...base, content].slice(-50);
    set({
      scriptRevisions:   { ...s.scriptRevisions,   [scriptId]: next },
      scriptRevisionIdx: { ...s.scriptRevisionIdx, [scriptId]: next.length - 1 },
    });
  },

  undoRevision: (scriptId) => {
    const s    = get();
    const hist = s.scriptRevisions[scriptId] ?? [];
    const idx  = s.scriptRevisionIdx[scriptId] ?? hist.length - 1;
    if (idx <= 0 || hist.length === 0) return null;
    const newIdx = idx - 1;
    set({ scriptRevisionIdx: { ...s.scriptRevisionIdx, [scriptId]: newIdx } });
    return hist[newIdx] ?? null;
  },

  redoRevision: (scriptId) => {
    const s    = get();
    const hist = s.scriptRevisions[scriptId] ?? [];
    const idx  = s.scriptRevisionIdx[scriptId] ?? hist.length - 1;
    if (idx >= hist.length - 1) return null;
    const newIdx = idx + 1;
    set({ scriptRevisionIdx: { ...s.scriptRevisionIdx, [scriptId]: newIdx } });
    return hist[newIdx] ?? null;
  },

  canUndo: (scriptId) => {
    const s   = get();
    const idx = s.scriptRevisionIdx[scriptId] ?? 0;
    return idx > 0;
  },

  canRedo: (scriptId) => {
    const s    = get();
    const hist = s.scriptRevisions[scriptId] ?? [];
    const idx  = s.scriptRevisionIdx[scriptId] ?? hist.length - 1;
    return idx < hist.length - 1;
  },
}));

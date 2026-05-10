/**
 * @module store/ui
 * Zustand store for UI state including:
 *  - Active tab navigation
 *  - Graph layout persistence (node positions, edges, viewport)
 *  - Logic simulation state (signal states, animation speed)
 *  - Notifications
 */

import { create } from 'zustand';
import type { Node, Edge, Viewport } from 'reactflow';
import type { SignalStates } from '../graph/propagate';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActiveTab = 'import' | 'settings' | 'graph' | 'scripts' | 'review' | 'export';
export type AnimationSpeed = 'slow' | 'normal' | 'fast';

export interface UIState {
  // ── Tab navigation ────────────────────────────────────────────────────────
  activeTab: ActiveTab;
  selectedScriptId: string | null;
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

  // ── Actions ───────────────────────────────────────────────────────────────
  setActiveTab: (tab: ActiveTab) => void;
  setSelectedScript: (id: string | null) => void;
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
}

// ─── Default viewport ─────────────────────────────────────────────────────────

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 0.8 };

// ─── Store ────────────────────────────────────────────────────────────────────

export const useUIStore = create<UIState>((set) => ({
  // Tab navigation
  activeTab:        'import',
  selectedScriptId:  null,
  graphLayoutDone:   false,
  notification:      null,

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

  // ── Tab actions ────────────────────────────────────────────────────────────
  setActiveTab:       (tab)  => set({ activeTab: tab }),
  setSelectedScript:  (id)   => set({ selectedScriptId: id }),
  setGraphLayoutDone: (done) => set({ graphLayoutDone: done }),
  showNotification:   (type, message) => set({ notification: { type, message } }),
  clearNotification:  ()     => set({ notification: null }),

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
}));

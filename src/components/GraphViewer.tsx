/**
 * @module components/GraphViewer
 * Full-featured graph viewer with:
 *  - Persistent layout (positions survive tab changes)
 *  - Interactive logic simulation (toggle any input/protection element)
 *  - Animated propagation cascade with configurable speed
 *  - Custom node types with inline settings display
 *  - Animated edges showing signal flow
 *  - Reset Graph button with confirmation
 *  - Propagation counter + speed control in toolbar
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Viewport,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { GitBranch, RotateCcw, Zap, Lightbulb, Eye, EyeOff, LayoutGrid, Cpu } from 'lucide-react';
import { useProjectStore } from '../store/project';
import { useUIStore, type AnimationSpeed } from '../store/ui';
import { NODE_TYPES, type GraphNodeData } from '../graph/nodes';
import { EDGE_TYPES, type AnimatedLogicEdgeData } from '../graph/edges';
import {
  applySignalStatesToLayout,
  applyEdgeStatesToLayout,
} from '../graph/buildReactFlow';
import { buildAreaLayout } from '../graph/areaLayout';
import { partitionGraph } from '../graph/partition';
import { FrontPanel } from './FrontPanel';
import {
  propagate,
  initialSignalStates,
  isToggleable,
  type SignalStates,
} from '../graph/propagate';
import { buildAnimationSequence } from '../graph/animator';
import type { DependencyGraph } from '../selogic/graph';
import type { ParsedRelaySettings } from '../relay-adapters/common/types';

// ─── Inner component ──────────────────────────────────────────────────────────

function GraphViewerInner() {
  const { graph, relay, activeProjectId } = useProjectStore();
  const {
    graphNodes: storedNodes, graphEdges: storedEdges,
    graphViewport: storedViewport, graphProjectId,
    signalStates, animationSpeed, lastChangeCount,
    pulsingEdgeIds, flashingNodes,
    showLedPb, hiddenAreaIds, showFrontPanel,
    saveGraphLayout, setGraphLayout,
    setSignalStates, resetSignalStates,
    setAnimationSpeed, setLastChangeCount,
    setPulsingEdgeIds, setFlashingNodes, clearAnimations,
    clearTimerStates,
    toggleLedPb, toggleFrontPanel, hideArea, showArea, showAllAreas,
  } = useUIStore();

  const { setViewport } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AnimatedLogicEdgeData>([]);
  const animTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [resetConfirm, setResetConfirm] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [areasMenuOpen, setAreasMenuOpen] = useState(false);
  const hiddenSet = React.useMemo(() => new Set(hiddenAreaIds), [hiddenAreaIds]);
  // Full area list (incl. hidden) for the Areas dropdown.
  const allAreas = React.useMemo(
    () => (graph ? partitionGraph(graph, relay, { includeLedPb: showLedPb }).areas : []),
    [graph, relay, showLedPb],
  );

  // ── Toggle handler ──────────────────────────────────────────────────────────
  const handleToggle = useCallback((nodeId: string, newValue: 0 | 1) => {
    if (!graph || !isToggleable(nodeId, graph)) return;

    const oldStates = signalStates;
    const { newStates, affected, sortedOrder } = propagate(oldStates, { [nodeId]: newValue }, graph);

    setSignalStates(newStates);
    setLastChangeCount(affected.length);

    // Build and schedule animation events
    animTimers.current.forEach(clearTimeout);
    animTimers.current = [];
    clearAnimations();

    const evts = buildAnimationSequence(oldStates, newStates, sortedOrder, graph, animationSpeed);

    for (const evt of evts) {
      if (evt.type === 'edge-pulse') {
        const t1 = setTimeout(() => setPulsingEdgeIds([evt.target]),               evt.timestamp);
        const t2 = setTimeout(() => setPulsingEdgeIds([]),                          evt.timestamp + evt.duration);
        animTimers.current.push(t1, t2);
      } else {
        const anim = evt.type === 'trip-ripple' ? 'trip-pulse' : evt.to === 1 ? 'flash-on' : 'flash-off';
        const t1 = setTimeout(() => setFlashingNodes({ [evt.target]: anim }),       evt.timestamp);
        const t2 = setTimeout(() => setFlashingNodes({ [evt.target]: 'idle' }),     evt.timestamp + evt.duration);
        animTimers.current.push(t1, t2);
      }
    }

    const totalMs = evts.length > 0
      ? Math.max(...evts.map(e => e.timestamp + e.duration)) + 200
      : 0;
    const fin = setTimeout(() => { clearAnimations(); }, totalMs);
    animTimers.current.push(fin);
  }, [graph, signalStates, animationSpeed,
      setSignalStates, setLastChangeCount, setPulsingEdgeIds, setFlashingNodes, clearAnimations]);

  // ── Build/restore layout when project changes ──────────────────────────────
  useEffect(() => {
    if (!graph) return;

    const isNewProject = graphProjectId !== activeProjectId;
    const states       = isNewProject ? initialSignalStates(graph) : signalStates;

    if (isNewProject) {
      // Problem 5: clear ALL timer states, reset signals, clear animations on relay switch
      clearTimerStates();
      resetSignalStates();
      clearAnimations();
    }

    // Restore stored layout for same project
    if (!isNewProject && storedNodes.length > 0) {
      setNodes(applySignalStatesToLayout(storedNodes, states, flashingNodes));
      setEdges(applyEdgeStatesToLayout(storedEdges, states, pulsingEdgeIds, graph));
      setViewport(storedViewport);
      return;
    }

    // Build fresh area-partitioned layout
    const { nodes: n, edges: e } = buildAreaLayout(graph, relay, states, handleToggle, {
      includeLedPb: showLedPb,
      hiddenAreaIds: new Set(hiddenAreaIds),
    });
    setNodes(n);
    setEdges(e);
    setGraphLayout(n, e, activeProjectId ?? '');

    // Apply 400ms smooth transition to new layout
    setTimeout(() => {
      setViewport({ x: 0, y: 0, zoom: 0.8 }, { duration: 400 });
    }, 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, activeProjectId]);

  // ── Rebuild when LED/PB toggle or hidden areas change ──────────────────────
  // Preserve the user's dragged area (group) positions across rebuilds so
  // arranging windows during testing survives a hide/show or LED/PB toggle.
  const didMountAreas = useRef(false);
  useEffect(() => {
    if (!graph) return;
    if (!didMountAreas.current) { didMountAreas.current = true; return; }

    // Preserve user-dragged position AND resized dimensions of each area window.
    const priorArea = new Map<string, { position: { x: number; y: number }; style?: React.CSSProperties }>();
    for (const nd of nodes) {
      if (nd.type === 'logicAreaNode') priorArea.set(nd.id, { position: nd.position, style: nd.style });
    }

    const { nodes: n, edges: e } = buildAreaLayout(graph, relay, signalStates, handleToggle, {
      includeLedPb: showLedPb,
      hiddenAreaIds: new Set(hiddenAreaIds),
    });
    const merged = n.map(nd => {
      const prior = nd.type === 'logicAreaNode' ? priorArea.get(nd.id) : undefined;
      return prior
        ? { ...nd, position: prior.position, style: { ...nd.style, ...prior.style } }
        : nd;
    });
    setNodes(merged);
    setEdges(e);
    setGraphLayout(merged, e, activeProjectId ?? '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLedPb, hiddenAreaIds]);

  // ── Sync signal states → node/edge data ───────────────────────────────────
  useEffect(() => {
    if (!graph || nodes.length === 0) return;
    setNodes(prev => applySignalStatesToLayout(prev, signalStates, flashingNodes));
    setEdges(prev => applyEdgeStatesToLayout(prev, signalStates, pulsingEdgeIds, graph));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signalStates, flashingNodes, pulsingEdgeIds]);

  // ── Keep onToggle current in node data ────────────────────────────────────
  useEffect(() => {
    if (nodes.length === 0) return;
    setNodes(prev => prev.map(n => ({ ...n, data: { ...n.data, onToggle: handleToggle } })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleToggle]);

  // ── Persist positions on drag/pan ─────────────────────────────────────────
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
  }, [onNodesChange]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChange(changes);
  }, [onEdgesChange]);

  const handleMoveEnd = useCallback((_: unknown, vp: Viewport) => {
    if (activeProjectId) saveGraphLayout(nodes, edges, vp, activeProjectId);
  }, [nodes, edges, activeProjectId, saveGraphLayout]);

  const handleNodeDragStop = useCallback(() => {
    if (activeProjectId) saveGraphLayout(nodes, edges, storedViewport, activeProjectId);
  }, [nodes, edges, activeProjectId, storedViewport, saveGraphLayout]);

  // ── Reset Graph ───────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    if (!resetConfirm) {
      setResetConfirm(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setResetConfirm(false), 3000);
      return;
    }
    setResetConfirm(false);
    if (!graph) return;
    const states = initialSignalStates(graph);
    clearTimerStates();
    resetSignalStates();
    clearAnimations();
    const { nodes: n, edges: e } = buildAreaLayout(graph, relay, states, handleToggle, {
      includeLedPb: showLedPb,
      hiddenAreaIds: new Set(hiddenAreaIds),
    });
    setNodes(n);
    setEdges(e);
    setGraphLayout(n, e, activeProjectId ?? '');
    setTimeout(() => setViewport({ x: 0, y: 0, zoom: 0.8 }, { duration: 400 }), 50);
  }, [resetConfirm, graph, relay, clearTimerStates, resetSignalStates, clearAnimations,
      handleToggle, setNodes, setEdges, setGraphLayout, activeProjectId, setViewport,
      showLedPb, hiddenAreaIds]);

  useEffect(() => () => {
    animTimers.current.forEach(clearTimeout);
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  if (!graph) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        <div className="text-center">
          <GitBranch className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>No dependency graph. Import a settings file first.</p>
        </div>
      </div>
    );
  }

  const totalEdges = Array.from(graph.nodes.values()).reduce((s, n) => s + n.dependencies.length, 0);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white border-b border-slate-200 flex-wrap gap-2 flex-shrink-0">
        <div className="flex items-center gap-3 text-xs flex-wrap">
          {[
            { color: '#dbeafe', border: '#3b82f6', label: 'Input' },
            { color: '#f0fdf4', border: '#00cc66', label: 'Active (1)' },
            { color: '#fef3c7', border: '#f59e0b', label: 'Output' },
            { color: '#fee2e2', border: '#ef4444', label: 'Trip' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ background: l.color, border: `1.5px solid ${l.border}` }} />
              <span className="text-slate-500">{l.label}</span>
            </div>
          ))}
          <span className="text-slate-300 select-none">|</span>
          <span className="text-slate-400">{graph.nodes.size} nodes · {totalEdges} edges</span>
        </div>

        <div className="flex items-center gap-2">
          {lastChangeCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              <Zap className="w-3 h-3" />
              {lastChangeCount} nodes updated
            </div>
          )}
          {/* Speed control */}
          <div className="flex items-center gap-0.5 rounded-md border border-slate-200 overflow-hidden text-xs">
            {(['slow', 'normal', 'fast'] as AnimationSpeed[]).map(s => (
              <button
                key={s}
                onClick={() => setAnimationSpeed(s)}
                className={`px-2 py-1 capitalize transition-colors ${
                  animationSpeed === s ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {/* LEDs / PBs toggle */}
          <button
            onClick={toggleLedPb}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              showLedPb ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            title="Show / hide LED and front-panel pushbutton areas"
          >
            <Lightbulb className="w-3.5 h-3.5" />
            LEDs / PBs
          </button>

          {/* Front-panel mockup toggle */}
          <button
            onClick={toggleFrontPanel}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              showFrontPanel ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            title="Show the relay front-panel mockup (live LEDs + clickable pushbuttons)"
          >
            <Cpu className="w-3.5 h-3.5" />
            Front Panel
          </button>

          {/* Areas show/hide dropdown */}
          <div className="relative">
            <button
              onClick={() => setAreasMenuOpen(o => !o)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                hiddenAreaIds.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title="Show, hide, or restore logic-area windows"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Areas{hiddenAreaIds.length > 0 ? ` (${hiddenAreaIds.length} hidden)` : ''}
            </button>
            {areasMenuOpen && (
              <div className="absolute right-0 mt-1 w-64 max-h-80 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg z-50 p-1.5">
                <div className="flex items-center justify-between px-1.5 py-1">
                  <span className="text-xs font-semibold text-slate-500">{allAreas.length} areas</span>
                  {hiddenAreaIds.length > 0 && (
                    <button onClick={showAllAreas} className="text-xs text-blue-600 hover:underline">Show all</button>
                  )}
                </div>
                {allAreas.map(a => {
                  const hidden = hiddenSet.has(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => (hidden ? showArea(a.id) : hideArea(a.id))}
                      className="w-full flex items-center justify-between gap-2 px-1.5 py-1 rounded hover:bg-slate-50 text-xs"
                    >
                      <span className={`truncate font-mono text-left ${hidden ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        {a.label}
                      </span>
                      {hidden
                        ? <EyeOff className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        : <Eye className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />}
                    </button>
                  );
                })}
                {allAreas.length === 0 && <div className="px-1.5 py-2 text-xs text-slate-400">No areas.</div>}
              </div>
            )}
          </div>

          {/* Reset */}
          <button
            onClick={handleReset}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              resetConfirm ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {resetConfirm ? 'Confirm?' : 'Reset Layout'}
          </button>
        </div>
      </div>

      {/* Hint bar */}
      <div className="px-3 py-1 bg-slate-50 border-b border-slate-100 text-xs text-slate-400 flex-shrink-0">
        💡 Toggle the <span className="text-blue-600 font-medium">0/1 pill</span> on any input or protection node to simulate logic. Computed nodes show a 🔒 lock.
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        {showFrontPanel && (
          <FrontPanel
            relay={relay}
            signalStates={signalStates}
            onToggle={handleToggle}
            onClose={toggleFrontPanel}
          />
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onMoveEnd={handleMoveEnd}
          onNodeDragStop={handleNodeDragStop}
          defaultViewport={storedViewport}
          minZoom={0.2}
          maxZoom={2.5}
          fitView={storedNodes.length === 0}
          fitViewOptions={{ padding: 0.15 }}
          attributionPosition="bottom-right"
          deleteKeyCode={null}
          nodesConnectable={false}
        >
          <Background color="var(--c-border)" gap={24} size={1} style={{ opacity: 0.15 }} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={n => {
              const s = signalStates[n.id] ?? 0;
              if (n.id === 'TR' || n.id === 'TRIP') return s === 1 ? '#ef4444' : '#fca5a5';
              if ((n.data as GraphNodeData)?.displayInfo?.kind === 'input') return s === 1 ? '#00cc66' : '#dbeafe';
              return s === 1 ? '#00cc66' : '#e2e8f0';
            }}
            maskColor="rgba(255,255,255,0.6)"
            pannable
            zoomable
          />
        </ReactFlow>
      </div>
    </div>
  );
}

// ─── Exported wrapper ─────────────────────────────────────────────────────────

export function GraphViewer() {
  return (
    <ReactFlowProvider>
      <GraphViewerInner />
    </ReactFlowProvider>
  );
}

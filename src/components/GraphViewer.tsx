import React, { useCallback, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { GitBranch } from 'lucide-react';
import { useProjectStore } from '../store/project';

const NODE_WIDTH = 140;
const NODE_HEIGHT = 60;
const H_GAP = 180;
const V_GAP = 80;

function buildLayout(graphNodes: Map<string, import('../selogic/graph').GraphNode>) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Group nodes by depth
  const depthGroups = new Map<number, string[]>();
  for (const [id, node] of graphNodes) {
    const d = node.depth;
    if (!depthGroups.has(d)) depthGroups.set(d, []);
    depthGroups.get(d)!.push(id);
  }

  const depths = Array.from(depthGroups.keys()).sort((a, b) => a - b);

  for (const depth of depths) {
    const ids = depthGroups.get(depth)!;
    ids.forEach((id, idx) => {
      const gn = graphNodes.get(id)!;
      const x = depth * H_GAP;
      const y = (idx - (ids.length - 1) / 2) * V_GAP;

      let bg = '#e2e8f0'; // default gray
      if (gn.isInput)  bg = '#dbeafe'; // blue — input
      if (gn.isOutput) bg = '#fef3c7'; // amber — output
      if (gn.label === 'TR' || gn.label === 'TRIP') bg = '#fee2e2'; // red — trip

      nodes.push({
        id,
        type: 'default',
        position: { x, y },
        data: { label: id },
        style: {
          background: bg,
          border: `1px solid ${gn.isOutput ? '#f59e0b' : gn.isInput ? '#3b82f6' : '#94a3b8'}`,
          borderRadius: 8,
          fontSize: 12,
          fontFamily: 'monospace',
          fontWeight: 600,
          width: NODE_WIDTH,
          padding: '6px 10px',
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });

      // Add edges from dependencies
      for (const dep of gn.dependencies) {
        edges.push({
          id: `${dep}->${id}`,
          source: dep,
          target: id,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#64748b' },
          style: { stroke: '#94a3b8', strokeWidth: 1.5 },
          animated: gn.isOutput,
        });
      }
    });
  }

  return { nodes, edges };
}

export function GraphViewer() {
  const { graph } = useProjectStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!graph) return;
    const { nodes: n, edges: e } = buildLayout(graph.nodes);
    setNodes(n);
    setEdges(e);
  }, [graph, setNodes, setEdges]);

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

  return (
    <div className="h-full flex flex-col">
      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs flex-wrap">
        <span className="font-semibold text-slate-600">Legend:</span>
        {[
          { color: '#dbeafe', border: '#3b82f6', label: 'Input / Hardware' },
          { color: '#e2e8f0', border: '#94a3b8', label: 'Logic element' },
          { color: '#fef3c7', border: '#f59e0b', label: 'Output' },
          { color: '#fee2e2', border: '#ef4444', label: 'Trip' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded" style={{ background: l.color, border: `1px solid ${l.border}` }} />
            <span className="text-slate-600">{l.label}</span>
          </div>
        ))}
        <span className="ml-auto text-slate-400">{graph.nodes.size} nodes · {Array.from(graph.nodes.values()).reduce((s, n) => s + n.dependencies.length, 0)} edges</span>
      </div>

      {/* ReactFlow Canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          attributionPosition="bottom-right"
        >
          <Background color="#e2e8f0" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={n => n.style?.background as string ?? '#e2e8f0'}
            maskColor="rgba(255,255,255,0.6)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

/**
 * @module graph/nodes
 * Custom React Flow node types for the SELogic graph viewer.
 *
 * Node types registered:
 *   protectionElement  — 51P / 50P / 21P / 87T / 67P with inline settings
 *   timerNode          — TD timers with animated arc progress
 *   latchNode          — SV / LT sealing elements with SET/RESET badge
 *   logicGateNode      — AND/OR/computed with compact OUT display
 *   inputSignalNode    — hardware inputs / toggleable binary signals
 *   tripOutputNode     — TR / TRIP with dramatic styling + ripple animation
 */

import React, { useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Lock } from 'lucide-react';
import type { NodeDisplayInfo, DisplaySetting } from './displaySettings';

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface GraphNodeData {
  nodeId: string;
  displayInfo: NodeDisplayInfo;
  signalState: 0 | 1;
  /** 'idle' | 'flash-on' | 'flash-off' | 'trip-pulse' | 'blocked' */
  animState: string;
  /** Timer fill progress 0.0–1.0 (only used by timerNode). */
  timerProgress?: number;
  onToggle: (nodeId: string, newValue: 0 | 1) => void;
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function stateGlow(state: 0 | 1, animState: string): React.CSSProperties {
  if (animState === 'trip-pulse') {
    return { boxShadow: '0 0 0 3px #ef4444, 0 0 16px 6px #ef444466' };
  }
  if (animState === 'flash-on' || (state === 1 && animState === 'idle')) {
    return { boxShadow: '0 0 0 2px #00ff88, 0 0 12px 4px #00ff8844' };
  }
  if (animState === 'blocked') {
    return { boxShadow: '0 0 0 2px #f97316, 0 0 10px 3px #f9731644' };
  }
  return {};
}

function stateBorderColor(state: 0 | 1, kind: string, isTripWordBit?: boolean): string {
  if (kind === 'trip') return state === 1 ? '#ef4444' : '#f87171';
  // Trip word bits get amber/gold border — computed, not user-toggleable
  if (isTripWordBit) return state === 1 ? '#f59e0b' : '#fbbf24';
  return state === 1 ? '#00ff88' : '#94a3b8';
}

// ─── Toggle pill ─────────────────────────────────────────────────────────────

function TogglePill({ nodeId, state, onToggle }: { nodeId: string; state: 0 | 1; onToggle: (id: string, v: 0 | 1) => void }) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(nodeId, state === 1 ? 0 : 1);
  }, [nodeId, state, onToggle]);

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold border transition-all duration-150 select-none ${
        state === 1
          ? 'bg-green-500 border-green-400 text-white'
          : 'bg-slate-200 border-slate-300 text-slate-500'
      }`}
      title={`Click to toggle ${state === 1 ? '→ 0' : '→ 1'}`}
    >
      <span className={`w-2.5 h-2.5 rounded-full transition-colors ${state === 1 ? 'bg-white' : 'bg-slate-400'}`} />
      {state}
    </button>
  );
}

// ─── Lock badge for non-toggleable computed nodes ─────────────────────────────

function ComputedBadge({ state }: { state: 0 | 1 }) {
  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono font-bold ${
      state === 1 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
    }`}>
      <Lock className="w-2.5 h-2.5 opacity-60" />
      OUT: {state}
    </div>
  );
}

// ─── Settings row ─────────────────────────────────────────────────────────────

function SettingsRows({ settings }: { settings: DisplaySetting[] }) {
  if (settings.length === 0) return null;
  return (
    <div className="border-t border-slate-200/60 mt-1.5 pt-1.5 space-y-0.5">
      {settings.map((s, i) =>
        s.isBadge ? (
          <div key={i} className="text-xs font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-center">
            {s.value}
          </div>
        ) : (
          <div key={i} className="flex justify-between gap-2 text-xs">
            <span className="text-slate-400 truncate">{s.label}</span>
            <span className="text-slate-700 font-mono font-medium text-right">{s.value}</span>
          </div>
        )
      )}
    </div>
  );
}

// ─── Handles ─────────────────────────────────────────────────────────────────

const inputHandle  = <Handle type="target" position={Position.Left}  style={{ background: '#94a3b8', width: 8, height: 8 }} />;
const outputHandle = <Handle type="source" position={Position.Right} style={{ background: '#94a3b8', width: 8, height: 8 }} />;

// ─── ProtectionElementNode ────────────────────────────────────────────────────

export function ProtectionElementNode({ id, data }: NodeProps<GraphNodeData>) {
  const { displayInfo, signalState, animState, onToggle } = data;
  const isTWB   = displayInfo.isTripWordBit ?? false;
  const border  = stateBorderColor(signalState, 'protection', isTWB);
  const glowStyle = isTWB && signalState === 1
    ? { boxShadow: '0 0 0 2px #f59e0b, 0 0 12px 4px #f59e0b44' }
    : stateGlow(signalState, animState);

  return (
    <div
      className="rounded-lg bg-white text-slate-800 min-w-[140px] max-w-[180px] transition-shadow duration-200"
      style={{ border: `2px solid ${border}`, padding: '6px 10px', ...glowStyle }}
    >
      {inputHandle}
      {/* Header */}
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="min-w-0">
          <div className="text-xs font-bold font-mono text-slate-800 truncate">
            {displayInfo.icon} {id}
          </div>
          <div className="text-xs text-slate-400 truncate leading-tight">{displayInfo.subtitle}</div>
          {isTWB && (
            <div className="text-xs font-semibold text-amber-600 leading-tight">Trip Word Bit</div>
          )}
        </div>
        {displayInfo.toggleable
          ? <TogglePill nodeId={id} state={signalState} onToggle={onToggle} />
          : <ComputedBadge state={signalState} />
        }
      </div>
      <SettingsRows settings={displayInfo.settings} />
      {outputHandle}
    </div>
  );
}

// ─── TimerNode ────────────────────────────────────────────────────────────────

export function TimerNode({ id, data }: NodeProps<GraphNodeData>) {
  const { displayInfo, signalState, animState, timerProgress = 0 } = data;
  const border = stateBorderColor(signalState, 'timer');
  const pct    = Math.min(1, Math.max(0, timerProgress));

  // SVG arc parameters
  const r  = 14;
  const cx = 18;
  const cy = 18;
  const circumference = 2 * Math.PI * r;
  const dashOffset    = circumference * (1 - pct);

  return (
    <div
      className="rounded-lg bg-white text-slate-800 min-w-[130px] max-w-[170px] transition-shadow duration-200"
      style={{ border: `2px solid ${border}`, padding: '6px 10px', ...stateGlow(signalState, animState) }}
    >
      {inputHandle}
      <div className="flex items-center gap-2 mb-1">
        {/* Timer arc indicator */}
        <svg width="36" height="36" className="flex-shrink-0">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="3" />
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={pct > 0 ? '#3b82f6' : '#cbd5e1'}
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-dashoffset 0.1s linear' }}
          />
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#475569">
            {Math.round(pct * 100)}%
          </text>
        </svg>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold font-mono truncate">⏱ {id}</div>
          <div className="text-xs text-slate-400 truncate">{displayInfo.subtitle}</div>
        </div>
      </div>
      <SettingsRows settings={displayInfo.settings} />
      <div className="mt-1 flex justify-end">
        <ComputedBadge state={signalState} />
      </div>
      {outputHandle}
    </div>
  );
}

// ─── LatchNode ────────────────────────────────────────────────────────────────

export function LatchNode({ id, data }: NodeProps<GraphNodeData>) {
  const { displayInfo, signalState, animState } = data;
  const border = stateBorderColor(signalState, 'latch');

  return (
    <div
      className="rounded-lg bg-white text-slate-800 min-w-[130px] max-w-[170px] transition-shadow duration-200"
      style={{ border: `2px solid ${border}`, padding: '6px 10px', ...stateGlow(signalState, animState) }}
    >
      {inputHandle}
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="text-xs font-bold font-mono truncate">🔒 {id}</div>
          <div className="text-xs text-slate-400 truncate">{displayInfo.subtitle}</div>
        </div>
        {/* Latch state badge */}
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
          signalState === 1
            ? 'bg-green-100 text-green-700'
            : 'bg-slate-100 text-slate-500'
        }`}>
          {signalState === 1 ? 'SET' : 'RESET'}
        </span>
      </div>
      <SettingsRows settings={displayInfo.settings} />
      {outputHandle}
    </div>
  );
}

// ─── LogicGateNode ────────────────────────────────────────────────────────────

export function LogicGateNode({ id, data }: NodeProps<GraphNodeData>) {
  const { displayInfo, signalState, animState } = data;
  const border = stateBorderColor(signalState, 'gate');

  return (
    <div
      className="rounded-lg bg-slate-50 text-slate-700 min-w-[110px] max-w-[160px] transition-shadow duration-200"
      style={{ border: `1.5px solid ${border}`, padding: '5px 8px', ...stateGlow(signalState, animState) }}
    >
      {inputHandle}
      <div className="flex items-center justify-between gap-1">
        <div className="min-w-0">
          <div className="text-xs font-bold font-mono truncate">⊕ {id}</div>
          <div className="text-xs text-slate-400 truncate leading-tight">{displayInfo.subtitle}</div>
        </div>
        <ComputedBadge state={signalState} />
      </div>
      {displayInfo.settings.length > 0 && (
        <div className="mt-1 text-xs text-slate-500 font-mono truncate">
          {displayInfo.settings[0].value}
        </div>
      )}
      {outputHandle}
    </div>
  );
}

// ─── InputSignalNode ──────────────────────────────────────────────────────────

export function InputSignalNode({ id, data }: NodeProps<GraphNodeData>) {
  const { displayInfo, signalState, animState, onToggle } = data;
  const border = stateBorderColor(signalState, 'input');

  return (
    <div
      className="rounded-lg bg-blue-50 text-blue-800 min-w-[110px] max-w-[150px] transition-shadow duration-200"
      style={{ border: `2px solid ${border}`, padding: '5px 8px', ...stateGlow(signalState, animState) }}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="min-w-0">
          <div className="text-xs font-bold font-mono truncate">↑ {id}</div>
          <div className="text-xs text-blue-500 truncate leading-tight">{displayInfo.subtitle || 'Input'}</div>
        </div>
        <TogglePill nodeId={id} state={signalState} onToggle={onToggle} />
      </div>
      {outputHandle}
    </div>
  );
}

// ─── TripOutputNode ───────────────────────────────────────────────────────────

export function TripOutputNode({ id, data }: NodeProps<GraphNodeData>) {
  const { displayInfo, signalState, animState } = data;
  const isTripped = signalState === 1;
  const isPulsing = animState === 'trip-pulse';

  return (
    <div
      className="rounded-xl text-white min-w-[140px] max-w-[200px] transition-all duration-300 relative overflow-hidden"
      style={{
        background:    isTripped ? '#ef4444' : '#64748b',
        border:        `3px solid ${isTripped ? '#fca5a5' : '#94a3b8'}`,
        padding:       '8px 12px',
        ...stateGlow(signalState, 'trip'),
        ...(isPulsing ? { animation: 'tripRipple 0.6s ease-out' } : {}),
      }}
    >
      {/* Ripple rings (animated via CSS) */}
      {isPulsing && (
        <>
          <div className="absolute inset-0 rounded-xl border-2 border-red-400 animate-ping opacity-75" />
          <div className="absolute inset-0 rounded-xl border-2 border-red-300 animate-ping opacity-50" style={{ animationDelay: '0.15s' }} />
        </>
      )}
      {inputHandle}
      <div className="relative z-10">
        <div className="text-sm font-bold font-mono">
          {isTripped ? '⚡ TRIP' : '⚡ ' + id}
        </div>
        <div className="text-xs opacity-80">{displayInfo.subtitle}</div>
        {displayInfo.settings.length > 0 && (
          <div className="text-xs mt-1 opacity-70 font-mono truncate">
            {displayInfo.settings[0].value}
          </div>
        )}
        <div className={`mt-1 text-xs font-bold px-2 py-0.5 rounded-full inline-block ${
          isTripped ? 'bg-white text-red-600' : 'bg-slate-600 text-slate-200'
        }`}>
          {isTripped ? 'ASSERTED' : 'NORMAL'}
        </div>
      </div>
    </div>
  );
}

// ─── LogicGateSymbolNode ──────────────────────────────────────────────────────
//
// Renders an IEEE-style SVG gate symbol.  Gate nodes are purely visual
// intermediates (AND/OR/NOT/EDGE) — they represent sub-expressions from the
// AST decomposition and are never user-toggleable.
//
// Gate colour palette (matches feature spec):
//   AND  — cyan   #00d4ff
//   OR   — purple #9966ff
//   NOT  — amber  #ffaa00
//   EDGE — bright cyan #00ffff

export type GateType = 'and' | 'or' | 'not' | 'edge';

export interface GateNodeData {
  gateType:    GateType;
  /** Number of input signals connected (1 for NOT/EDGE, 2 for AND/OR). */
  inputCount:  1 | 2;
  signalState: 0 | 1;
  animState:   string;
}

const GATE_COLORS: Record<GateType, string> = {
  and:  '#00d4ff',
  or:   '#9966ff',
  not:  '#ffaa00',
  edge: '#00ffff',
};

const GATE_LABELS: Record<GateType, string> = {
  and:  'AND',
  or:   'OR',
  not:  'NOT',
  edge: '↑EDGE',
};

/** SVG body for each gate type.  All viewBox "0 0 48 32". */
function GateShape({ type, active }: { type: GateType; active: boolean }) {
  const color = GATE_COLORS[type];
  const fill  = active ? `${color}22` : 'transparent';
  const stroke = color;

  switch (type) {
    // AND gate — flat left, semicircle right
    case 'and':
      return (
        <path
          d="M4,4 L22,4 A12,12 0 0,1 22,28 L4,28 Z"
          fill={fill} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round"
        />
      );

    // OR gate — concave left, pointed right
    case 'or':
      return (
        <path
          d="M4,4 Q14,16 4,28 Q18,24 30,16 Q18,8 4,4 Z"
          fill={fill} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round"
        />
      );

    // NOT gate — triangle + bubble
    case 'not':
      return (
        <>
          <path
            d="M4,4 L28,16 L4,28 Z"
            fill={fill} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round"
          />
          <circle cx="31" cy="16" r="3" fill={fill} stroke={stroke} strokeWidth="2" />
        </>
      );

    // EDGE detector — rising-edge waveform icon
    case 'edge':
      return (
        <polyline
          points="4,24 16,24 16,8 28,8 28,24 38,24"
          fill="none" stroke={stroke} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        />
      );
  }
}

export function LogicGateSymbolNode({ id, data }: NodeProps<GateNodeData>) {
  const { gateType, inputCount, signalState, animState } = data;
  const color  = GATE_COLORS[gateType];
  const active = signalState === 1;
  const glowStyle = active
    ? { boxShadow: `0 0 0 2px ${color}, 0 0 10px 3px ${color}44` }
    : animState === 'blocked'
      ? { boxShadow: '0 0 0 2px #f97316, 0 0 8px 3px #f9731644' }
      : {};

  // Input handle positions: centred for 1 input, staggered for 2
  const inputHandleA = inputCount === 2
    ? { top: '33%' }
    : { top: '50%', transform: 'translateY(-50%)' };
  const inputHandleB = { top: '67%' };

  return (
    <div
      className="relative flex items-center justify-center transition-shadow duration-200"
      style={{ width: 64, height: 44, ...glowStyle }}
    >
      {/* Input handles */}
      <Handle
        type="target" position={Position.Left} id="a"
        style={{ background: color, width: 7, height: 7, ...inputHandleA }}
      />
      {inputCount === 2 && (
        <Handle
          type="target" position={Position.Left} id="b"
          style={{ background: color, width: 7, height: 7, ...inputHandleB }}
        />
      )}

      {/* Gate SVG body */}
      <svg viewBox="0 0 48 32" width={56} height={38} style={{ overflow: 'visible' }}>
        <GateShape type={gateType} active={active} />

        {/* Gate label inside shape */}
        <text
          x="14" y="19"
          textAnchor="middle"
          fontSize="7"
          fontFamily="monospace"
          fontWeight="bold"
          fill={active ? GATE_COLORS[gateType] : '#94a3b8'}
        >
          {GATE_LABELS[gateType]}
        </text>
      </svg>

      {/* Output handle */}
      <Handle
        type="source" position={Position.Right}
        style={{ background: color, width: 7, height: 7, top: '50%', transform: 'translateY(-50%)' }}
      />
    </div>
  );
}

// ─── Node type registry ───────────────────────────────────────────────────────

export const NODE_TYPES = {
  protectionElement: ProtectionElementNode,
  timerNode:         TimerNode,
  latchNode:         LatchNode,
  logicGateNode:     LogicGateNode,
  inputSignalNode:   InputSignalNode,
  tripOutputNode:    TripOutputNode,
  // Logic gate symbol nodes (AST-decomposed)
  andGate:           LogicGateSymbolNode,
  orGate:            LogicGateSymbolNode,
  notGate:           LogicGateSymbolNode,
  edgeGate:          LogicGateSymbolNode,
};

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
import { useThemeStore } from '../store/theme';
import { useUIStore } from '../store/ui';
import { Handle, Position, NodeResizer, type NodeProps } from 'reactflow';
import { Lock, X } from 'lucide-react';
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
  /** Timer phase (only used by timerNode for arc coloring). */
  timerPhase?: string;
  /** Countdown text (only used by timerNode). */
  countdownText?: string;
  onToggle: (nodeId: string, newValue: 0 | 1) => void;
}

// ─── Output contact node data ─────────────────────────────────────────────────

export interface OutputContactNodeData {
  nodeId: string;
  /** The SELogic expression this contact is driven by (e.g. "TR"). */
  expression: string;
  signalState: 0 | 1;
  animState: string;
}

// ─── Style helpers ────────────────────────────────────────────────────────────

function stateGlow(state: 0 | 1, animState: string): React.CSSProperties {
  if (animState === 'trip-pulse') {
    return { boxShadow: '0 0 0 3px var(--trip), 0 0 16px 6px color-mix(in srgb, var(--trip) 40%, transparent)' };
  }
  if (animState === 'flash-on' || (state === 1 && animState === 'idle')) {
    return { boxShadow: '0 0 0 2px var(--asserted), 0 0 12px 4px color-mix(in srgb, var(--asserted) 27%, transparent)' };
  }
  if (animState === 'blocked') {
    return { boxShadow: '0 0 0 2px var(--blocked), 0 0 10px 3px color-mix(in srgb, var(--blocked) 27%, transparent)' };
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

// Invisible handles: functional connection points, no dot marker (dots = NOT bubble in IEEE/IEC notation)
const HANDLE_STYLE: React.CSSProperties = { background: 'transparent', border: 'none', width: 8, height: 8 };
const inputHandle  = <Handle type="target" position={Position.Left}  style={HANDLE_STYLE} />;
const outputHandle = <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />;

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
      className="rounded-lg min-w-[140px] max-w-[180px] transition-shadow duration-200"
      style={{ border: `2px solid ${border}`, padding: '6px 10px', background: 'var(--surface, white)', color: 'var(--text, #0f172a)', ...glowStyle }}
    >
      {inputHandle}
      {/* Header */}
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="min-w-0">
          <div className="text-xs font-bold font-mono truncate">
            {displayInfo.icon} {data.nodeId ?? id}
          </div>
          <div className="text-xs text-slate-400 truncate leading-tight">{displayInfo.subtitle}</div>
          {isTWB && (
            <div className="text-xs font-semibold text-amber-600 leading-tight">Trip Word Bit</div>
          )}
        </div>
        {displayInfo.toggleable
          ? <TogglePill nodeId={data.nodeId ?? id} state={signalState} onToggle={onToggle} />
          : <ComputedBadge state={signalState} />
        }
      </div>
      <SettingsRows settings={displayInfo.settings} />
      {outputHandle}
    </div>
  );
}

// ─── TimerNode ────────────────────────────────────────────────────────────────

/** Returns the arc stroke color based on timer phase. */
function arcStrokeColor(phase: string, pct: number): string {
  if (phase === 'timing-pu') return '#ffaa00';   // amber while counting up
  if (phase === 'tripped')   return '#00ff88';   // green when tripped/held
  if (phase === 'timing-do') return '#888888';   // gray while draining DO
  return pct > 0 ? '#3b82f6' : '#cbd5e1';        // fallback blue / light gray
}

export function TimerNode({ id, data }: NodeProps<GraphNodeData>) {
  const { displayInfo, signalState, animState, timerProgress = 0, timerPhase = 'idle', countdownText = '' } = data;
  const border = stateBorderColor(signalState, 'timer');
  const pct    = Math.min(1, Math.max(0, timerProgress));

  // SVG arc parameters (stroke-dasharray/dashoffset approach — no CSS animation)
  const r  = 14;
  const cx = 18;
  const cy = 18;
  const circumference = 2 * Math.PI * r;
  const dashOffset    = circumference * (1 - pct);
  const arcColor      = arcStrokeColor(timerPhase, pct);

  // Display text inside arc
  const arcText = timerPhase === 'tripped' ? 'TIMED' : countdownText || `${Math.round(pct * 100)}%`;
  const arcTextShort = arcText.length > 6 ? arcText.slice(0, 5) + '…' : arcText;

  return (
    <div
      className="rounded-lg min-w-[130px] max-w-[170px] transition-shadow duration-200"
      style={{ border: `2px solid ${border}`, padding: '6px 10px', background: 'var(--surface, white)', color: 'var(--text, #0f172a)', ...stateGlow(signalState, animState) }}
    >
      {inputHandle}
      <div className="flex items-center gap-2 mb-1">
        {/* Timer arc indicator (SVG stroke-dasharray, no CSS animation) */}
        <svg width="36" height="36" className="flex-shrink-0">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth="3" />
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={arcColor}
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize="7" fontFamily="monospace" fill="#475569">
            {arcTextShort}
          </text>
        </svg>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold font-mono truncate">⏱ {data.nodeId ?? id}</div>
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
      className="rounded-lg min-w-[130px] max-w-[170px] transition-shadow duration-200"
      style={{ border: `2px solid ${border}`, padding: '6px 10px', background: 'var(--surface, white)', color: 'var(--text, #0f172a)', ...stateGlow(signalState, animState) }}
    >
      {inputHandle}
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="text-xs font-bold font-mono truncate">🔒 {data.nodeId ?? id}</div>
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
      className="rounded-lg min-w-[110px] max-w-[160px] transition-shadow duration-200"
      style={{ border: `1.5px solid ${border}`, padding: '5px 8px', background: 'var(--surface-alt, #f8fafc)', color: 'var(--text, #334155)', ...stateGlow(signalState, animState) }}
    >
      {inputHandle}
      <div className="flex items-center justify-between gap-1">
        <div className="min-w-0">
          <div className="text-xs font-bold font-mono truncate">⊕ {data.nodeId ?? id}</div>
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
      className="rounded-lg min-w-[110px] max-w-[150px] transition-shadow duration-200"
      style={{ border: `2px solid ${border}`, padding: '5px 8px', background: 'var(--surface, #eff6ff)', color: 'var(--text-accent, #1e40af)', ...stateGlow(signalState, animState) }}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="min-w-0">
          <div className="text-xs font-bold font-mono truncate">↑ {data.nodeId ?? id}</div>
          <div className="text-xs text-blue-500 truncate leading-tight">{displayInfo.subtitle || 'Input'}</div>
        </div>
        <TogglePill nodeId={data.nodeId ?? id} state={signalState} onToggle={onToggle} />
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
          {'⚡ ' + (data.nodeId ?? id)}
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
  and:  'var(--gate-and, #00d4ff)',
  or:   'var(--gate-or, #9966ff)',
  not:  'var(--gate-not, #ffaa00)',
  edge: 'var(--gate-edge, #00ffff)',
};

// Theme-specific gate SVG shapes
const gateShapes: Record<string, Record<string, { viewBox: string; path: string; circle?: { cx: number; cy: number; r: number }; label?: string; sublabel?: string }>> = {
  default: {
    and:  { viewBox: '0 0 48 32', path: 'M 4,4 L 22,4 Q 44,4 44,16 Q 44,28 22,28 L 4,28 Z' },
    or:   { viewBox: '0 0 48 32', path: 'M 4,4 Q 14,4 44,16 Q 14,28 4,28 Q 14,16 4,4 Z' },
    not:  { viewBox: '0 0 48 32', path: 'M 4,4 L 38,16 L 4,28 Z', circle: {cx:43,cy:16,r:5} },
    edge: { viewBox: '0 0 48 32', path: 'M 4,4 L 4,28 L 44,28 L 44,4 Z M 14,24 L 14,12 L 26,12 L 26,24' },
  },
  smud: {
    and:  { viewBox: '0 0 48 32', path: 'M 4,6 Q 8,4 22,4 Q 46,4 46,16 Q 46,28 22,28 Q 8,28 4,26 Q 10,16 4,6 Z' },
    or:   { viewBox: '0 0 48 32', path: 'M 4,4 Q 16,6 44,16 Q 16,26 4,28 Q 12,20 10,16 Q 12,12 4,4 Z' },
    not:  { viewBox: '0 0 48 32', path: 'M 4,6 L 36,16 L 4,26 Q 8,16 4,6 Z', circle: {cx:43,cy:16,r:5} },
    edge: { viewBox: '0 0 48 32', path: 'M 4,4 L 4,28 L 44,28 L 44,4 Z M 12,24 L 12,14 Q 16,8 24,8 L 24,14 L 36,14 L 36,24' },
  },
  pge: {
    and:  { viewBox: '0 0 48 32', path: 'M 4,4 L 20,4 Q 44,4 44,16 Q 44,28 20,28 L 4,28 Z' },
    or:   { viewBox: '0 0 48 32', path: 'M 4,4 Q 14,4 44,16 Q 14,28 4,28 Q 14,16 4,4 Z' },
    not:  { viewBox: '0 0 48 32', path: 'M 4,4 L 38,16 L 4,28 Z', circle: {cx:43,cy:16,r:5} },
    edge: { viewBox: '0 0 48 32', path: 'M 4,4 L 4,28 L 44,28 L 44,4 Z M 14,24 L 14,12 L 26,12 L 26,24' },
  },
  blueprint: {
    and:  { viewBox: '0 0 48 32', path: 'M 4,4 L 44,4 L 44,28 L 4,28 Z', label: '&' },
    or:   { viewBox: '0 0 48 32', path: 'M 4,4 L 44,4 L 44,28 L 4,28 Z', label: '≥1' },
    not:  { viewBox: '0 0 48 32', path: 'M 4,4 L 44,4 L 44,28 L 4,28 Z', label: '1', circle: {cx:50,cy:16,r:4} },
    edge: { viewBox: '0 0 48 32', path: 'M 4,4 L 44,4 L 44,28 L 4,28 Z', label: '↑' },
  },
  'neon-grid': {
    and:  { viewBox: '0 0 48 32', path: 'M 4,2 L 44,2 L 44,30 L 4,30 Z', label: 'AND', sublabel: 'U1' },
    or:   { viewBox: '0 0 48 32', path: 'M 4,2 L 44,2 L 44,30 L 4,30 Z', label: 'OR', sublabel: 'U2' },
    not:  { viewBox: '0 0 48 32', path: 'M 4,2 L 44,2 L 44,30 L 4,30 Z', label: 'INV', sublabel: 'U3', circle: {cx:50,cy:16,r:3} },
    edge: { viewBox: '0 0 48 32', path: 'M 4,2 L 44,2 L 44,30 L 4,30 Z', label: 'CLK↑', sublabel: 'U4' },
  },
  illuminated: {
    and:  { viewBox: '0 0 48 40', path: 'M 24,4 L 44,12 L 44,28 L 24,36 L 4,28 L 4,12 Z' },
    or:   { viewBox: '0 0 48 48', path: 'M 24,4 Q 34,14 44,24 Q 34,34 24,44 Q 14,34 4,24 Q 14,14 24,4 Z' },
    not:  { viewBox: '0 0 48 32', path: 'M 24,4 L 44,28 L 4,28 Z', circle: {cx:24,cy:36,r:5} },
    edge: { viewBox: '0 0 48 32', path: 'M 24,28 L 4,28 L 24,4 L 44,28 Z M 24,4 L 24,0' },
  },
};

function getGateShape(theme: string, type: GateType) {
  return (gateShapes[theme] ?? gateShapes['default'])[type] ?? gateShapes['default'][type];
}


const GATE_LABELS: Record<GateType, string> = {
  and:  'AND',
  or:   'OR',
  not:  'NOT',
  edge: '↑EDGE',
};

/** SVG body for each gate type - theme-aware. */
function GateShape({ type, active, theme }: { type: GateType; active: boolean; theme: string }) {
  const color  = GATE_COLORS[type];
  const fill   = active ? `${color}22` : 'transparent';
  const stroke = color;
  const shape  = getGateShape(theme, type);
  return (
    <>
      <path
        d={shape.path}
        fill={fill} stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
      />
      {shape.circle && (
        <circle
          cx={shape.circle.cx} cy={shape.circle.cy} r={shape.circle.r}
          fill={fill} stroke={stroke} strokeWidth="2"
        />
      )}
      {shape.label && (
        <text x="24" y="20" textAnchor="middle" fontSize="9" fontFamily="monospace" fontWeight="bold" fill={stroke}>{shape.label}</text>
      )}
      {shape.sublabel && (
        <text x="24" y="29" textAnchor="middle" fontSize="6" fontFamily="monospace" fill={stroke} opacity={0.6}>{shape.sublabel}</text>
      )}
    </>
  );
}
export function LogicGateSymbolNode({ id: _id, data }: NodeProps<GateNodeData>) {
  const { gateType, inputCount, signalState, animState } = data;
  const { theme } = useThemeStore();
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
        style={{ background: 'transparent', border: 'none', width: 8, height: 8, ...inputHandleA }}
      />
      {inputCount === 2 && (
        <Handle
          type="target" position={Position.Left} id="b"
          style={{ background: 'transparent', border: 'none', width: 8, height: 8, ...inputHandleB }}
        />
      )}

      {/* Gate SVG body */}
      <svg viewBox="0 0 48 32" width={56} height={38} style={{ overflow: 'visible' }}>
        <GateShape type={gateType} active={active} theme={theme} />

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
        style={{ background: 'transparent', border: 'none', width: 8, height: 8, top: '50%', transform: 'translateY(-50%)' }}
      />
    </div>
  );
}

// ─── OutputContactNode ────────────────────────────────────────────────────────
//
// Displays a physical output contact (OUT101, OUT201, etc.).
// Shape: rectangular with relay contact symbol.
// Color: dark bg, bright green border when asserted, gray when de-asserted.
// NOT user-toggleable — purely computed from TR/ALARM/etc.

export function OutputContactNode({ id, data }: NodeProps<OutputContactNodeData>) {
  const { expression, signalState, animState } = data;
  const isAsserted = signalState === 1;

  const borderColor = isAsserted ? '#00ff88' : '#64748b';
  const glowStyle   = isAsserted
    ? { boxShadow: '0 0 0 2px #00ff88, 0 0 12px 4px #00ff8844' }
    : {};
  const animGlow    = animState === 'flash-on' || animState === 'trip-pulse'
    ? { boxShadow: '0 0 0 2px #00ff88, 0 0 16px 6px #00ff8866' }
    : glowStyle;

  return (
    <div
      className="rounded-lg text-white min-w-[130px] max-w-[160px] transition-all duration-200"
      style={{
        background: isAsserted ? 'var(--surface, #0f2b1e)' : 'var(--surface-alt, #1e293b)',
        border:      `2px solid ${borderColor}`,
        padding:     '6px 10px',
        ...animGlow,
      }}
    >
      {inputHandle}
      {/* Contact symbol row */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="min-w-0">
          <div className="text-sm font-bold font-mono">{data.nodeId ?? id}</div>
          <div className="text-xs opacity-60 truncate">= {expression}</div>
        </div>
        {/* Relay contact symbol */}
        <svg width="24" height="20" viewBox="0 0 24 20">
          <line x1="2" y1="10" x2="8" y2="10" stroke={borderColor} strokeWidth="2" />
          <line x1="16" y1="10" x2="22" y2="10" stroke={borderColor} strokeWidth="2" />
          {isAsserted ? (
            // Closed contact: horizontal bar
            <line x1="8" y1="10" x2="16" y2="10" stroke={borderColor} strokeWidth="2" />
          ) : (
            // Open contact: diagonal bar
            <line x1="8" y1="14" x2="16" y2="6" stroke={borderColor} strokeWidth="2" />
          )}
          <line x1="8" y1="6" x2="8" y2="14" stroke={borderColor} strokeWidth="1.5" />
          <line x1="16" y1="6" x2="16" y2="14" stroke={borderColor} strokeWidth="1.5" />
        </svg>
      </div>
      {/* Status badge */}
      <div className={`text-xs font-bold px-1.5 py-0.5 rounded text-center ${
        isAsserted
          ? 'bg-green-500 text-white'
          : 'bg-slate-600 text-slate-300'
      }`}>
        {isAsserted ? '● CLOSED' : '○ OPEN'}
      </div>
    </div>
  );
}

// ─── LogicAreaNode (group / window frame) ─────────────────────────────────────
//
// A draggable bordered "window" that visually groups one logic area's nodes.
// Children are parented to it (React Flow `parentNode`) so dragging the frame
// moves the whole area. The header carries the area label + a hide button.

export interface LogicAreaNodeData {
  label: string;
  kind: 'output' | 'sv' | 'led' | 'pb';
  areaId: string;
  width: number;
  height: number;
}

const AREA_ACCENT: Record<LogicAreaNodeData['kind'], string> = {
  output: '#3b82f6',
  sv:     '#9333ea',
  led:    '#f59e0b',
  pb:     '#0d9488',
};

export function LogicAreaNode({ data }: NodeProps<LogicAreaNodeData>) {
  const hideArea = useUIStore(s => s.hideArea);
  const setAreaSize = useUIStore(s => s.setAreaSize);
  const accent = AREA_ACCENT[data.kind] ?? AREA_ACCENT.output;

  return (
    <>
      {/* Drag the corners/edges to resize the window. */}
      <NodeResizer
        minWidth={200}
        minHeight={120}
        lineStyle={{ borderColor: accent, opacity: 0.4 }}
        handleStyle={{ width: 9, height: 9, borderRadius: 2, background: '#fff', border: `2px solid ${accent}` }}
        onResizeEnd={(_e, params) => setAreaSize(data.areaId, params.width, params.height)}
      />
      <div
        style={{
          width: '100%',
          height: '100%',
          border: `2px solid ${accent}`,
          borderRadius: 10,
          background: `color-mix(in srgb, ${accent} 6%, var(--surface, #ffffff))`,
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <div
          className="flex items-center justify-between gap-2 px-2"
          style={{ height: 26, background: accent, color: '#fff' }}
        >
          <span className="truncate font-mono text-xs font-bold">{data.label}</span>
          <button
            className="nodrag flex-shrink-0 rounded p-0.5 hover:bg-black/20"
            title="Hide this area"
            onClick={(e) => { e.stopPropagation(); hideArea(data.areaId); }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </>
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
  outputContactNode: OutputContactNode,
  logicAreaNode:     LogicAreaNode,
  // Logic gate symbol nodes (AST-decomposed)
  andGate:           LogicGateSymbolNode,
  orGate:            LogicGateSymbolNode,
  notGate:           LogicGateSymbolNode,
  edgeGate:          LogicGateSymbolNode,
};

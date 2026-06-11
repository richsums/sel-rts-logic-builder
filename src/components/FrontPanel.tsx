/**
 * @module components/FrontPanel
 * A relay front-panel mockup: programmable target LEDs that illuminate live from
 * the current simulation state, and clickable pushbuttons that drive the logic.
 * Rendered as a docked overlay on the Graph tab.
 */

import React from 'react';
import { X, Lightbulb } from 'lucide-react';
import type { ParsedRelaySettings } from '../relay-adapters/common/types';
import type { SignalStates } from '../graph/propagate';
import { evaluateAST } from '../graph/propagate';
import { parseExpression } from '../selogic/parser';
import { extractEnabledLeds, extractEnabledPushbuttons } from '../graph/ledPb';

interface Props {
  relay: ParsedRelaySettings | null;
  signalStates: SignalStates;
  onToggle: (nodeId: string, value: 0 | 1) => void;
  onClose: () => void;
}

/** LED lamp colour by convention (driving expression / label hints). */
function ledColor(id: string, expr: string): string {
  const s = `${id} ${expr}`.toUpperCase();
  if (/TRIP|\bTR\b|50|51|67|87|21/.test(s)) return '#ef4444'; // red — trip/protection
  if (/CLOSE|\bCL\b|79/.test(s)) return '#22c55e';            // green — close/reclose
  return '#f59e0b';                                            // amber — general
}

export function FrontPanel({ relay, signalStates, onToggle, onClose }: Props) {
  const leds = extractEnabledLeds(relay);
  const pbs = extractEnabledPushbuttons(relay);

  const isLit = (expr: string): boolean => {
    const ast = parseExpression(expr);
    return ast ? evaluateAST(ast, signalStates) === 1 : false;
  };

  return (
    <div className="absolute top-2 right-2 bottom-2 z-30 w-72 flex flex-col rounded-xl shadow-2xl border border-slate-700 bg-slate-900 text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2 text-xs font-bold tracking-wide">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          FRONT PANEL{relay?.tag ? ` · ${relay.tag}` : ''}
        </div>
        <button className="rounded p-0.5 hover:bg-slate-700" title="Close front panel" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-4">
        {/* Target LEDs */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Target LEDs ({leds.length})
          </div>
          {leds.length === 0 ? (
            <div className="text-xs text-slate-500">No programmable LEDs detected in settings.</div>
          ) : (
            <div className="space-y-1.5">
              {leds.map(led => {
                const lit = isLit(led.expression);
                const c = ledColor(led.id, led.expression);
                return (
                  <div key={led.id} className="flex items-center gap-2">
                    <span
                      className="flex-shrink-0 rounded-full transition-all"
                      style={{
                        width: 14, height: 14,
                        background: lit ? c : '#1e293b',
                        border: `2px solid ${lit ? c : '#334155'}`,
                        boxShadow: lit ? `0 0 8px 2px ${c}` : 'none',
                      }}
                    />
                    <span className={`font-mono text-xs ${lit ? 'text-white font-bold' : 'text-slate-400'}`}>
                      {led.id}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500 truncate">{led.note ?? led.expression}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pushbuttons */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Pushbuttons ({pbs.length})
          </div>
          {pbs.length === 0 ? (
            <div className="text-xs text-slate-500">No front-panel pushbuttons detected in settings.</div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {pbs.map(pb => {
                const on = (signalStates[pb.id] ?? 0) === 1;
                return (
                  <button
                    key={pb.id}
                    onClick={() => onToggle(pb.id, on ? 0 : 1)}
                    title={pb.note ?? pb.expression}
                    className={`rounded-lg border px-2 py-2 text-xs font-bold font-mono transition-all ${
                      on
                        ? 'bg-amber-500 border-amber-300 text-slate-900 shadow-[0_0_10px_2px_rgba(245,158,11,0.5)]'
                        : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {pb.id}
                    <span className="block text-[9px] font-normal opacity-70">{on ? 'PRESSED' : 'idle'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="px-3 py-1.5 bg-slate-800 border-t border-slate-700 text-[10px] text-slate-400">
        LEDs illuminate live · click a pushbutton to drive the logic
      </div>
    </div>
  );
}

/**
 * @module components/FrontPanel
 * Relay front-panel mockup: target LEDs illuminate live from simulation state,
 * and pushbuttons are momentary (press = assert PBn, release = de-assert) so a
 * press drives the relay's SET/RST latch logic exactly like the real button.
 *
 * For the SEL-351S family, the layout mimics the physical faceplate: a target
 * LED bank (LED12–LED26, latchable per the Global LEDnnL flags) above an
 * operator section (LED1–LED11 paired with pushbuttons PB1–PB8/PB10).
 * Other models fall back to a generic list layout.
 */

import React from 'react';
import { X, Lightbulb } from 'lucide-react';
import type { ParsedRelaySettings } from '../relay-adapters/common/types';
import type { SignalStates } from '../graph/propagate';
import { evaluateAST } from '../graph/propagate';
import { parseExpression } from '../selogic/parser';
import {
  extractEnabledLeds,
  extractEnabledPushbuttons,
  extractReferencedPushbuttons,
  type LedPbItem,
} from '../graph/ledPb';

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

/** A single faceplate LED with label. */
function Lamp({ item, lit }: { item: LedPbItem | null; lit: boolean }) {
  const c = item ? ledColor(item.id, item.expression) : '#334155';
  return (
    <div className="flex items-center gap-1.5 min-w-0" title={item ? `${item.id} = ${item.expression}` : 'not programmed'}>
      <span
        className="flex-shrink-0 rounded-full transition-all"
        style={{
          width: 11, height: 11,
          background: lit ? c : '#1e293b',
          border: `2px solid ${lit ? c : '#334155'}`,
          boxShadow: lit ? `0 0 7px 2px ${c}` : 'none',
          opacity: item ? 1 : 0.35,
        }}
      />
      <span className={`font-mono text-[10px] truncate ${lit ? 'text-white font-bold' : item ? 'text-slate-400' : 'text-slate-600'}`}>
        {item?.id ?? '—'}
      </span>
    </div>
  );
}

/** Momentary pushbutton: pointer-down asserts PBn, pointer-up releases it. */
function PushButton({
  id, inUse, pressed, onToggle,
}: { id: string; inUse: boolean; pressed: boolean; onToggle: Props['onToggle'] }) {
  return (
    <button
      disabled={!inUse}
      onPointerDown={() => inUse && onToggle(id, 1)}
      onPointerUp={() => inUse && onToggle(id, 0)}
      onPointerLeave={() => inUse && pressed && onToggle(id, 0)}
      title={inUse ? `${id} — momentary (hold to assert)` : `${id} — not used in logic`}
      className={`rounded-md border px-1 py-2 text-[10px] font-bold font-mono transition-all select-none ${
        !inUse
          ? 'bg-slate-800/40 border-slate-700 text-slate-600'
          : pressed
            ? 'bg-amber-500 border-amber-300 text-slate-900 shadow-[0_0_10px_2px_rgba(245,158,11,0.5)] translate-y-px'
            : 'bg-slate-700 border-slate-500 text-slate-200 hover:bg-slate-600 active:translate-y-px'
      }`}
    >
      {id}
    </button>
  );
}

export function FrontPanel({ relay, signalStates, onToggle, onClose }: Props) {
  const leds = extractEnabledLeds(relay);
  const ledById = new Map(leds.map(l => [l.id, l]));
  const pbAssigned = extractEnabledPushbuttons(relay);
  const pbReferenced = extractReferencedPushbuttons(relay);
  const pbInUse = new Set([...pbAssigned, ...pbReferenced].map(p => p.id));

  const isLit = (item: LedPbItem | null | undefined): boolean => {
    if (!item) return false;
    const ast = parseExpression(item.expression);
    return ast ? evaluateAST(ast, signalStates) === 1 : false;
  };

  const is351 = /351/.test(relay?.model ?? '');
  // SEL-351S faceplate banks: targets LED12–26, operator LEDs LED1–11, PB1–PB10.
  const targetSlots = is351
    ? Array.from({ length: 15 }, (_, i) => ledById.get(`LED${i + 12}`) ?? null)
    : leds.map(l => l as LedPbItem | null);
  const operatorSlots = is351
    ? Array.from({ length: 11 }, (_, i) => ledById.get(`LED${i + 1}`) ?? null)
    : [];
  const pbCount = is351 ? 10 : Math.max(pbInUse.size, 0);
  const pbIds = is351
    ? Array.from({ length: pbCount }, (_, i) => `PB${i + 1}`)
    : [...pbInUse];

  return (
    <div className="absolute top-2 right-2 bottom-2 z-30 w-80 flex flex-col rounded-xl shadow-2xl border border-slate-700 bg-slate-900 text-slate-100 overflow-hidden">
      {/* Bezel header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2 text-xs font-bold tracking-wide">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          {relay?.model ?? 'RELAY'}{relay?.tag ? ` · ${relay.tag}` : ''}
        </div>
        <button className="rounded p-0.5 hover:bg-slate-700" title="Close front panel" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-4">
        {/* Target LED bank */}
        <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            {is351 ? 'Targets (LED12–LED26)' : `Target LEDs (${leds.length})`}
          </div>
          {targetSlots.length === 0 ? (
            <div className="text-xs text-slate-500">No programmable LEDs detected in settings.</div>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {targetSlots.map((item, i) => (
                <Lamp key={item?.id ?? `t${i}`} item={item} lit={isLit(item)} />
              ))}
            </div>
          )}
        </div>

        {/* Operator section: LEDs + momentary pushbuttons */}
        {(is351 || pbIds.length > 0) && (
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Operator Controls
            </div>
            {operatorSlots.length > 0 && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-3">
                {operatorSlots.map((item, i) => (
                  <Lamp key={item?.id ?? `o${i}`} item={item} lit={isLit(item)} />
                ))}
              </div>
            )}
            {pbIds.length === 0 ? (
              <div className="text-xs text-slate-500">No front-panel pushbuttons detected.</div>
            ) : (
              <div className="grid grid-cols-5 gap-1.5">
                {pbIds.map(id => (
                  <PushButton
                    key={id}
                    id={id}
                    inUse={pbInUse.has(id)}
                    pressed={(signalStates[id] ?? 0) === 1}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-3 py-1.5 bg-slate-800 border-t border-slate-700 text-[10px] text-slate-400">
        LEDs illuminate live · pushbuttons are momentary — hold to assert
      </div>
    </div>
  );
}

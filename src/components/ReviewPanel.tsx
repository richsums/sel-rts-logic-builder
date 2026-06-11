import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { CheckCircle, XCircle, ChevronLeft, ChevronRight, ClipboardCheck, AlertTriangle, ShieldOff } from 'lucide-react';
import { useProjectStore } from '../store/project';
import { validateScript } from '../rts/validator';

export function ReviewPanel() {
  const { scripts, approveScript, rejectScript, updateScriptContent } = useProjectStore();
  const [reviewIdx, setReviewIdx] = useState(0);

  if (scripts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        <div className="text-center">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>No scripts to review. Import a settings file first.</p>
        </div>
      </div>
    );
  }

  const current = scripts[reviewIdx];
  const validation = current ? validateScript(current.content) : null;
  const approved = scripts.filter(s => s.approved).length;
  const rejected = scripts.filter(s => !s.approved).length;
  const invalid  = scripts.filter(s => s.validationErrors && s.validationErrors.length > 0).length;
  const hasValidationError = !!(current && current.validationErrors && current.validationErrors.length > 0);

  // Split scripts into positive and inhibit groups
  const positiveScripts = scripts.filter(s => s.pattern !== 'INHIBIT');
  const inhibitScripts  = scripts.filter(s => s.pattern === 'INHIBIT');

  return (
    <div className="h-full flex flex-col">
      {/* Review Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-slate-700">
            Script {reviewIdx + 1} of {scripts.length}
          </span>
          <div className="flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle className="w-4 h-4" />{approved} approved
            </span>
            <span className="flex items-center gap-1 text-slate-500">
              <XCircle className="w-4 h-4" />{rejected} rejected
            </span>
            {inhibitScripts.length > 0 && (
              <span className="flex items-center gap-1 text-purple-600 text-xs font-medium">
                <ShieldOff className="w-3.5 h-3.5" />{inhibitScripts.length} inhibit
              </span>
            )}
            {invalid > 0 && (
              <span className="flex items-center gap-1 bg-red-500 text-white text-xs rounded-full px-2 py-0.5 font-bold">
                <AlertTriangle className="w-3 h-3" />{invalid} invalid
              </span>
            )}
          </div>
        </div>

        {/* Nav + Actions */}
        <div className="flex items-center gap-2">
          <button onClick={() => setReviewIdx(i => Math.max(0, i - 1))} disabled={reviewIdx === 0} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setReviewIdx(i => Math.min(scripts.length - 1, i + 1))} disabled={reviewIdx === scripts.length - 1} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40">
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="h-5 w-px bg-slate-200 mx-1" />
          <button
            onClick={() => approveScript(current.id)}
            disabled={hasValidationError}
            title={hasValidationError ? 'Fix validation errors before approving' : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${hasValidationError
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
                : current.approved
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-green-50 hover:text-green-700'}`}
          >
            <CheckCircle className="w-4 h-4" />Approve
          </button>
          <button
            onClick={() => rejectScript(current.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!current.approved ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-700'}`}
          >
            <XCircle className="w-4 h-4" />Reject
          </button>
        </div>
      </div>

      {/* Validation Error Banner */}
      {hasValidationError && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-red-700">
            <span className="font-semibold">Validation errors — this script cannot be approved or exported: </span>
            {current.validationErrors!.join(' · ')}
          </div>
        </div>
      )}

      {/* Script Info Bar */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-4 text-sm flex-wrap">
        <span className="font-mono font-bold text-blue-700">{current.label}</span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${patternBadge(current.pattern)}`}>
          {current.pattern === 'INHIBIT' ? 'INHIBIT Test' : `Pattern ${current.pattern}`}
        </span>
        <span className="text-slate-500">Lines: {current.sourceLines.join(', ')}</span>
        {current.modified && <span className="text-amber-600 text-xs font-medium">● Manually modified</span>}
        {validation && !hasValidationError && (
          validation.valid
            ? <span className="text-green-600 flex items-center gap-1 text-xs"><CheckCircle className="w-3.5 h-3.5" />Valid</span>
            : <span className="text-red-600 flex items-center gap-1 text-xs"><XCircle className="w-3.5 h-3.5" />{validation.errors[0]}</span>
        )}
        {validation && validation.warnings.length > 0 && (
          <span className="text-amber-600 flex items-center gap-1 text-xs">
            <AlertTriangle className="w-3.5 h-3.5" />{validation.warnings[0]}
          </span>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage="plaintext"
          value={current.content}
          onChange={val => { if (val !== undefined) updateScriptContent(current.id, val); }}
          theme="vs-light"
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            lineNumbers: 'on',
            wordWrap: 'off',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
          }}
        />
      </div>

      {/* Script Status Overview */}
      <div className="px-4 py-2 border-t border-slate-200 bg-white flex flex-col gap-2">
        {/* Positive tests — grouped by logic area */}
        {positiveScripts.length > 0 && (() => {
          const groups = new Map<string, typeof positiveScripts>();
          for (const s of positiveScripts) {
            const key = s.areaLabel ?? 'Other';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(s);
          }
          const renderChip = (s: typeof positiveScripts[number]) => {
            const globalIdx = scripts.indexOf(s);
            const isInvalid = s.validationErrors && s.validationErrors.length > 0;
            const isCoverageGap = (s as { coverageGap?: boolean }).coverageGap;
            return (
              <button
                key={s.id}
                onClick={() => setReviewIdx(globalIdx)}
                title={`${s.label} — ${isInvalid ? 'Invalid' : isCoverageGap ? 'Coverage gap' : s.approved ? 'Approved' : 'Rejected'}`}
                className={`w-7 h-7 rounded text-xs font-mono font-bold transition-colors ${
                  globalIdx === reviewIdx ? 'ring-2 ring-blue-400' : ''
                } ${
                  isInvalid
                    ? 'bg-red-200 text-red-800 hover:bg-red-300'
                    : isCoverageGap
                      ? 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300'
                      : s.approved
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {s.label.slice(0, 2)}
              </button>
            );
          };
          return (
            <div className="flex flex-col gap-2">
              <div className="text-xs text-slate-400 font-medium">
                Logic-Area Tests ({positiveScripts.length} in {groups.size} areas)
              </div>
              {[...groups.entries()].map(([area, list]) => (
                <div key={area}>
                  <div className="text-[11px] font-mono font-semibold text-blue-700 mb-1 truncate" title={area}>
                    {area}
                  </div>
                  <div className="flex gap-1 flex-wrap">{list.map(renderChip)}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Inhibit (blocking logic) tests */}
        {inhibitScripts.length > 0 && (
          <div>
            <div className="text-xs text-slate-400 font-medium mb-1 flex items-center gap-1">
              <ShieldOff className="w-3.5 h-3.5 text-purple-500" />
              Blocking Logic Tests ({inhibitScripts.length})
            </div>
            <div className="flex gap-1 flex-wrap">
              {inhibitScripts.map((s) => {
                const globalIdx = scripts.indexOf(s);
                const isInvalid = s.validationErrors && s.validationErrors.length > 0;
                return (
                  <button
                    key={s.id}
                    onClick={() => setReviewIdx(globalIdx)}
                    title={`${s.label} — Inhibit test${isInvalid ? ' (Invalid)' : s.approved ? ' (Approved)' : ' (Rejected)'}`}
                    className={`px-2 h-7 rounded text-xs font-mono font-bold transition-colors ${
                      globalIdx === reviewIdx ? 'ring-2 ring-purple-400' : ''
                    } ${
                      isInvalid
                        ? 'bg-red-200 text-red-800 hover:bg-red-300'
                        : s.approved
                          ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {s.label.replace('_INHIBIT_', '⊘').slice(0, 12)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function patternBadge(p: string): string {
  const m: Record<string, string> = {
    A:       'bg-blue-100 text-blue-700',
    B:       'bg-red-100 text-red-700',
    C:       'bg-purple-100 text-purple-700',
    D:       'bg-indigo-100 text-indigo-700',
    E:       'bg-amber-100 text-amber-700',
    F:       'bg-gray-100 text-gray-700',
    G:       'bg-green-100 text-green-700',
    H:       'bg-cyan-100 text-cyan-700',
    I:       'bg-rose-100 text-rose-700',
    J:       'bg-teal-100 text-teal-700',
    INHIBIT: 'bg-purple-100 text-purple-800',
  };
  return m[p] ?? 'bg-slate-100 text-slate-600';
}

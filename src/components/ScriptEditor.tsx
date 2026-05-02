import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { FileCode, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useProjectStore } from '../store/project';
import { useUIStore } from '../store/ui';
import { validateScript } from '../rts/validator';

export function ScriptEditor() {
  const { scripts, updateScriptContent } = useProjectStore();
  const { selectedScriptId, setSelectedScript } = useUIStore();

  const selected = scripts.find(s => s.id === selectedScriptId) ?? scripts[0] ?? null;

  if (scripts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        <div className="text-center">
          <FileCode className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>No scripts generated yet. Import a settings file first.</p>
        </div>
      </div>
    );
  }

  const validation = selected ? validateScript(selected.content) : null;

  return (
    <div className="h-full flex">
      {/* Script List */}
      <div className="w-56 flex-shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200 bg-white">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Scripts ({scripts.length})</p>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {scripts.map(script => (
            <button
              key={script.id}
              onClick={() => setSelectedScript(script.id)}
              className={`w-full text-left px-3 py-2 transition-colors ${
                selectedScriptId === script.id || (!selectedScriptId && script.id === scripts[0].id)
                  ? 'bg-blue-50 border-r-2 border-blue-600'
                  : 'hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-xs font-semibold text-slate-800 truncate">{script.label}</span>
                <span className={`text-xs px-1 rounded ${patternColor(script.pattern)}`}>{script.pattern}</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                {script.approved
                  ? <CheckCircle className="w-3 h-3 text-green-500" />
                  : <XCircle className="w-3 h-3 text-red-400" />}
                {script.modified && <span className="text-xs text-amber-500">●</span>}
                <span className="text-xs text-slate-400 truncate">{script.filename}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected && (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-800">{selected.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${patternColor(selected.pattern)}`}>
                  Pattern {selected.pattern}
                </span>
                {selected.modified && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Modified</span>
                )}
              </div>
              {validation && (
                <div className="flex items-center gap-2 text-xs">
                  {validation.valid
                    ? <span className="flex items-center gap-1 text-green-600"><CheckCircle className="w-3.5 h-3.5" />Valid</span>
                    : <span className="flex items-center gap-1 text-red-600"><XCircle className="w-3.5 h-3.5" />{validation.errors[0]}</span>}
                  {validation.warnings.length > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="w-3.5 h-3.5" />{validation.warnings[0]}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Monaco Editor */}
            <div className="flex-1">
              <Editor
                height="100%"
                defaultLanguage="plaintext"
                value={selected.content}
                onChange={val => {
                  if (val !== undefined) updateScriptContent(selected.id, val);
                }}
                theme="vs-light"
                options={{
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  lineNumbers: 'on',
                  wordWrap: 'off',
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  renderWhitespace: 'selection',
                  tabSize: 2,
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function patternColor(p: string): string {
  const colors: Record<string, string> = {
    A: 'bg-blue-100 text-blue-700',
    B: 'bg-red-100 text-red-700',
    C: 'bg-purple-100 text-purple-700',
    D: 'bg-indigo-100 text-indigo-700',
    E: 'bg-amber-100 text-amber-700',
    F: 'bg-gray-100 text-gray-700',
    G: 'bg-green-100 text-green-700',
  };
  return colors[p] ?? 'bg-slate-100 text-slate-600';
}

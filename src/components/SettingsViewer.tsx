import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Settings, Code } from 'lucide-react';
import { useProjectStore } from '../store/project';

export function SettingsViewer() {
  const { relay } = useProjectStore();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['MAIN', 'SET1']));
  const [activeView, setActiveView] = useState<'sections' | 'logic'>('sections');

  if (!relay) {
    return (
      <div className="p-6 text-center text-slate-500">
        <Settings className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <p>No relay settings loaded. Import a settings file first.</p>
      </div>
    );
  }

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{relay.model} — {relay.tag}</h2>
          <p className="text-sm text-slate-500">{relay.sourceFile} · {relay.lineCount} lines · FW {relay.firmware}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveView('sections')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeView === 'sections' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            <FileText className="w-4 h-4 inline mr-1" />Sections
          </button>
          <button
            onClick={() => setActiveView('logic')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeView === 'logic' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            <Code className="w-4 h-4 inline mr-1" />Logic ({relay.logicEquations.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeView === 'sections' ? (
          <div className="space-y-2">
            {relay.settingGroups.map(group => (
              <div key={group.name} className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                  onClick={() => toggleGroup(group.name)}
                >
                  <div className="flex items-center gap-2">
                    {expandedGroups.has(group.name) ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    <span className="font-mono font-semibold text-slate-700">[{group.name}]</span>
                    <span className="text-xs text-slate-400">line {group.source.lineNumber} · {group.entries.length} entries</span>
                  </div>
                </button>
                {expandedGroups.has(group.name) && (
                  <div className="divide-y divide-slate-100">
                    {group.entries.length === 0 ? (
                      <p className="px-4 py-2 text-sm text-slate-400 italic">No entries</p>
                    ) : group.entries.map((entry, i) => (
                      <div key={i} className="grid grid-cols-[180px_1fr_80px] gap-3 px-4 py-2 hover:bg-slate-50 text-sm">
                        <span className="font-mono text-blue-700 font-medium">{entry.key}</span>
                        <span className="font-mono text-slate-700 truncate" title={entry.value}>{entry.value}</span>
                        <span className="text-xs text-slate-400 text-right">L{entry.source.lineNumber}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {relay.logicEquations.map((eq, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3 hover:border-blue-200 hover:bg-blue-50/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-blue-700">{eq.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${fnTypeColor(eq.functionType)}`}>{eq.functionType}</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-1">{eq.description}</p>
                    <code className="text-sm text-slate-700 bg-slate-100 px-2 py-1 rounded block font-mono break-all">{eq.expression}</code>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap">L{eq.source.lineNumber}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function fnTypeColor(type: string): string {
  const colors: Record<string, string> = {
    TRIP: 'bg-red-100 text-red-700',
    PICKUP: 'bg-orange-100 text-orange-700',
    TIMER_IN: 'bg-purple-100 text-purple-700',
    TIMER_OUT: 'bg-purple-100 text-purple-700',
    LATCH_SET: 'bg-blue-100 text-blue-700',
    LATCH_RESET: 'bg-blue-100 text-blue-700',
    OUTPUT: 'bg-green-100 text-green-700',
    ALARM: 'bg-amber-100 text-amber-700',
    BLOCK: 'bg-gray-100 text-gray-700',
    GENERAL: 'bg-slate-100 text-slate-600',
  };
  return colors[type] ?? 'bg-slate-100 text-slate-600';
}

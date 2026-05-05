import React, { useEffect } from 'react';
import {
  Upload, Settings, GitBranch, FileCode, ClipboardCheck, Download,
  CheckCircle, XCircle, Info, X, Cpu, ChevronDown,
} from 'lucide-react';
import { useProjectStore } from './store/project';
import { useUIStore, type ActiveTab } from './store/ui';
import { ImportPanel } from './components/ImportPanel';
import { SettingsViewer } from './components/SettingsViewer';
import { GraphViewer } from './components/GraphViewer';
import { ScriptEditor } from './components/ScriptEditor';
import { ReviewPanel } from './components/ReviewPanel';
import { ExportPanel } from './components/ExportPanel';

const TABS: Array<{ id: ActiveTab; label: string; Icon: React.ElementType; requiresData?: boolean }> = [
  { id: 'import',   label: 'Import',   Icon: Upload },
  { id: 'settings', label: 'Settings', Icon: Settings,      requiresData: true },
  { id: 'graph',    label: 'Graph',    Icon: GitBranch,     requiresData: true },
  { id: 'scripts',  label: 'Scripts',  Icon: FileCode,      requiresData: true },
  { id: 'review',   label: 'Review',   Icon: ClipboardCheck, requiresData: true },
  { id: 'export',   label: 'Export',   Icon: Download,       requiresData: true },
];

export default function App() {
  const { projects, activeProjectId, relay, scripts, coverage, setActiveProject } = useProjectStore();
  const { activeTab, setActiveTab, notification, clearNotification } = useUIStore();

  const hasData = relay !== null;

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(clearNotification, 4500);
    return () => clearTimeout(t);
  }, [notification, clearNotification]);

  return (
    <div className="flex flex-col h-screen bg-slate-100 font-sans">
      {/* ── Top Bar ── */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#1a3a5c] text-white flex-shrink-0 shadow-md z-10 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Cpu className="w-6 h-6 text-[#e8b84b] flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="font-bold text-sm leading-tight whitespace-nowrap">SEL-RTS Logic Script Builder</h1>
            {relay && (
              <p className="text-blue-200 text-xs truncate">{relay.model} · {relay.tag} · {relay.sourceFile}</p>
            )}
          </div>
        </div>

        {/* Relay selector */}
        {projects.length > 1 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-blue-300 text-xs mr-1 hidden sm:block">Relay:</span>
            <div className="relative">
              <select
                value={activeProjectId ?? ''}
                onChange={e => setActiveProject(e.target.value)}
                className="appearance-none bg-[#0f2540] text-white text-xs pl-2 pr-6 py-1.5 rounded border border-blue-400/30 hover:border-blue-300 transition-colors cursor-pointer"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.relay.model} — {p.relay.tag}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-blue-300 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Stats */}
        {hasData && (
          <div className="hidden sm:flex items-center gap-4 text-xs text-blue-100 flex-shrink-0">
            <span><span className="text-[#e8b84b] font-bold">{relay?.logicEquations.length ?? 0}</span> equations</span>
            <span><span className="text-[#e8b84b] font-bold">{scripts.length}</span> scripts</span>
            {coverage && (
              <span><span className="text-[#e8b84b] font-bold">{coverage.coveragePercent}%</span> coverage</span>
            )}
          </div>
        )}
      </header>

      {/* ── Tab Bar ── */}
      <nav className="flex bg-white border-b border-slate-200 flex-shrink-0 overflow-x-auto">
        {TABS.map(({ id, label, Icon, requiresData }) => {
          const disabled = requiresData && !hasData;
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => !disabled && setActiveTab(id)}
              disabled={disabled}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                active
                  ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                  : disabled
                  ? 'border-transparent text-slate-300 cursor-not-allowed'
                  : 'border-transparent text-slate-600 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {/* Badge counts */}
              {id === 'review' && hasData && (() => {
                const invalid = scripts.filter(s => s.validationErrors?.length > 0).length;
                return invalid > 0
                  ? <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{invalid}</span>
                  : null;
              })()}
            </button>
          );
        })}
      </nav>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-hidden">
        <div className={`h-full ${activeTab === 'import' || activeTab === 'export' ? 'overflow-y-auto' : ''}`}>
          {activeTab === 'import'   && <ImportPanel />}
          {activeTab === 'settings' && <SettingsViewer />}
          {activeTab === 'graph'    && <GraphViewer />}
          {activeTab === 'scripts'  && <ScriptEditor />}
          {activeTab === 'review'   && <ReviewPanel />}
          {activeTab === 'export'   && <ExportPanel />}
        </div>
      </main>

      {/* ── Notification Toast ── */}
      {notification && (
        <div className={`fixed bottom-4 right-4 flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm max-w-sm z-50 ${
          notification.type === 'success' ? 'bg-green-600' :
          notification.type === 'error'   ? 'bg-red-600'   :
                                            'bg-blue-600'
        }`}>
          {notification.type === 'success' && <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          {notification.type === 'error'   && <XCircle     className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          {notification.type === 'info'    && <Info        className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <p className="flex-1">{notification.message}</p>
          <button onClick={clearNotification} className="flex-shrink-0 opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

import React, { useEffect } from 'react';
import {
  Upload, Settings, GitBranch, FileCode, ClipboardCheck, Download,
  CheckCircle, XCircle, Info, X, Cpu, BarChart2
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
  { id: 'settings', label: 'Settings', Icon: Settings, requiresData: true },
  { id: 'graph',    label: 'Graph',    Icon: GitBranch, requiresData: true },
  { id: 'scripts',  label: 'Scripts',  Icon: FileCode, requiresData: true },
  { id: 'review',   label: 'Review',   Icon: ClipboardCheck, requiresData: true },
  { id: 'export',   label: 'Export',   Icon: Download, requiresData: true },
];

export default function App() {
  const { relay, scripts, coverage } = useProjectStore();
  const { activeTab, setActiveTab, notification, clearNotification } = useUIStore();

  const hasData = relay !== null;

  // Auto-dismiss notification
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(clearNotification, 4000);
    return () => clearTimeout(t);
  }, [notification, clearNotification]);

  return (
    <div className="flex flex-col h-screen bg-slate-100 font-sans">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-[#1a3a5c] text-white flex-shrink-0 shadow-md z-10">
        <div className="flex items-center gap-3">
          <Cpu className="w-6 h-6 text-[#e8b84b]" />
          <div>
            <h1 className="font-bold text-base leading-tight">SEL-RTS Logic Script Builder</h1>
            {relay && (
              <p className="text-blue-200 text-xs">{relay.model} · {relay.tag} · {relay.sourceFile}</p>
            )}
          </div>
        </div>

        {/* Stats */}
        {hasData && (
          <div className="hidden sm:flex items-center gap-4 text-xs text-blue-100">
            <span><span className="text-[#e8b84b] font-bold">{relay?.logicEquations.length ?? 0}</span> equations</span>
            <span><span className="text-[#e8b84b] font-bold">{scripts.length}</span> scripts</span>
            {coverage && (
              <span><span className="text-[#e8b84b] font-bold">{coverage.coveragePercent}%</span> coverage</span>
            )}
          </div>
        )}
      </header>

      {/* Tab Bar */}
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
            </button>
          );
        })}
      </nav>

      {/* Main Content */}
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

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed bottom-4 right-4 flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm max-w-sm z-50 ${
          notification.type === 'success' ? 'bg-green-600' :
          notification.type === 'error'   ? 'bg-red-600' :
                                            'bg-blue-600'
        }`}>
          {notification.type === 'success' && <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          {notification.type === 'error'   && <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          {notification.type === 'info'    && <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <p className="flex-1">{notification.message}</p>
          <button onClick={clearNotification} className="flex-shrink-0 opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

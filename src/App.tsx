import React, { useEffect, useRef, useState } from 'react';
import {
  Upload, Settings, GitBranch, FileCode, ClipboardCheck, Download,
  CheckCircle, XCircle, Info, X, Cpu, ChevronDown, Palette,
} from 'lucide-react';
import { useProjectStore } from './store/project';
import { useUIStore, type ActiveTab } from './store/ui';
import { useThemeStore, THEMES, type ThemeId } from './store/theme';
import { ImportPanel }    from './components/ImportPanel';
import { SettingsViewer } from './components/SettingsViewer';
import { GraphViewer }    from './components/GraphViewer';
import { ScriptEditor }   from './components/ScriptEditor';
import { ReviewPanel }    from './components/ReviewPanel';
import { ExportPanel }    from './components/ExportPanel';

const TABS: Array<{ id: ActiveTab; label: string; Icon: React.ElementType; requiresData?: boolean }> = [
  { id: 'import',   label: 'Import',   Icon: Upload },
  { id: 'settings', label: 'Settings', Icon: Settings,       requiresData: true },
  { id: 'graph',    label: 'Graph',    Icon: GitBranch,      requiresData: true },
  { id: 'scripts',  label: 'Scripts',  Icon: FileCode,       requiresData: true },
  { id: 'review',   label: 'Review',   Icon: ClipboardCheck, requiresData: true },
  { id: 'export',   label: 'Export',   Icon: Download,       requiresData: true },
];

const THEME_ICONS: Record<string, string> = {
  light: 'L', dark: 'D', contrast: 'HC', midnight: 'M', default: 'SC', smud: 'SM', pge: 'PG', blueprint: 'BP', 'neon-grid': 'NG', illuminated: 'IL',
};
const GRAPH_THEME_IDS_SET = new Set(['default', 'smud', 'pge', 'blueprint', 'neon-grid', 'illuminated']);

export default function App() {
  const { projects, activeProjectId, relay, scripts, coverage, setActiveProject } = useProjectStore();
  const { activeTab, setActiveTab, notification, clearNotification } = useUIStore();
  const { theme, setTheme } = useThemeStore();
  const [themeOpen, setThemeOpen] = useState(false);
  const themePanelRef = useRef<HTMLDivElement>(null);
  const hasData = relay !== null;

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(clearNotification, 4500);
    return () => clearTimeout(t);
  }, [notification, clearNotification]);

  // Close theme panel on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (themePanelRef.current && !themePanelRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    }
    if (themeOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [themeOpen]);

  // Ctrl+Shift+T cycles through all themes
  useEffect(() => {
    const allIds = THEMES.map(t => t.id);
    function handleKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        const idx = allIds.indexOf(theme);
        const next = allIds[(idx + 1) % allIds.length];
        setTheme(next);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [theme, setTheme]);

  return (
    <div
      data-theme={theme}
      className="flex flex-col h-screen font-sans"
      style={{ backgroundColor: 'var(--c-bg-app)', color: 'var(--c-text-primary)' }}
    >
      {/* ── Top Bar ── */}
      <header
        className="flex items-center justify-between px-4 py-2.5 flex-shrink-0 z-10 gap-4"
        style={{
          backgroundColor: 'var(--c-bg-header)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
        }}
      >
        {/* Logo + relay info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-1.5 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
            <Cpu className="w-5 h-5" style={{ color: 'var(--c-stat-hl)' }} />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-sm leading-tight whitespace-nowrap tracking-tight" style={{ color: 'var(--c-header-text)' }}>
              SEL-RTS Logic Script Builder
            </h1>
            {relay && (
              <p className="text-xs truncate" style={{ color: 'var(--c-header-sub)' }}>
                {relay.model} · {relay.tag} · {relay.sourceFile}
              </p>
            )}
          </div>
        </div>

        {/* Relay selector (multi-project) */}
        {projects.length > 1 && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs hidden sm:block" style={{ color: 'var(--c-header-sub)' }}>Relay:</span>
            <div className="relative">
              <select
                value={activeProjectId ?? ''}
                onChange={e => setActiveProject(e.target.value)}
                className="appearance-none text-xs pl-2.5 pr-6 py-1.5 rounded-md border cursor-pointer transition-colors"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  color: 'var(--c-header-text)',
                  borderColor: 'rgba(255,255,255,0.15)',
                }}
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}
                    style={{ backgroundColor: 'var(--c-bg-surface)', color: 'var(--c-text-primary)' }}>
                    {p.relay.model} — {p.relay.tag}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" style={{ color: 'var(--c-header-sub)' }} />
            </div>
          </div>
        )}

        {/* Right: stats + theme picker */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          {hasData && (
            <div className="hidden sm:flex items-center gap-2">
              <StatPill label="equations" value={relay?.logicEquations.length ?? 0} />
              <StatPill label="scripts"   value={scripts.length} />
              {coverage && <StatPill label="coverage" value={`${coverage.coveragePercent}%`} />}
            </div>
          )}

          {/* Theme selector */}
          <div className="relative" ref={themePanelRef}>
            <button
              onClick={() => setThemeOpen(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                backgroundColor: themeOpen ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
                color: 'var(--c-header-text)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
              title="Switch display theme"
            >
              <Palette className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{THEME_ICONS[theme]}</span>
            </button>

            {themeOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-64 rounded-xl shadow-2xl z-50 overflow-hidden"
                style={{
                  backgroundColor: 'var(--c-bg-surface)',
                  border: '1px solid var(--c-border)',
                }}
              >
                <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <p className="text-xs font-semibold tracking-wider" style={{ color: 'var(--c-text-muted)' }}>
                    DISPLAY THEME
                  </p>
                </div>
                <div className="px-3 py-1" style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--c-text-muted)' }}>UI THEMES</p>
                </div>
                {THEMES.filter(t => !GRAPH_THEME_IDS_SET.has(t.id)).map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setTheme(t.id); setThemeOpen(false); }}
                    className="w-full text-left px-3 py-2 flex items-start gap-3 transition-opacity hover:opacity-80"
                    style={{
                      backgroundColor: theme === t.id ? 'var(--c-accent-soft)' : 'transparent',
                      borderLeft: theme === t.id ? '3px solid var(--c-accent)' : '3px solid transparent',
                    }}
                  >
                    <span className="text-lg leading-none mt-0.5 flex-shrink-0">{t.icon}</span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: theme === t.id ? 'var(--c-accent-soft-t)' : 'var(--c-text-primary)' }}>{t.label}</p>
                      <p className="text-xs" style={{ color: 'var(--c-text-muted)' }}>{t.description}</p>
                    </div>
                  </button>
                ))}
                <div className="px-3 py-1" style={{ borderTop: '1px solid var(--c-border)', borderBottom: '1px solid var(--c-border)' }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--c-text-muted)' }}>GRAPH THEMES</p>
                </div>
                {THEMES.filter(t => GRAPH_THEME_IDS_SET.has(t.id)).map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setTheme(t.id); setThemeOpen(false); }}
                    className="w-full text-left px-3 py-2 flex items-start gap-3 transition-opacity hover:opacity-80"
                    style={{
                      backgroundColor: theme === t.id ? 'var(--c-accent-soft)' : 'transparent',
                      borderLeft: theme === t.id ? '3px solid var(--c-accent)' : '3px solid transparent',
                    }}
                  >
                    <span className="text-lg leading-none mt-0.5 flex-shrink-0">{t.icon}</span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: theme === t.id ? 'var(--c-accent-soft-t)' : 'var(--c-text-primary)' }}>{t.label}</p>
                      <p className="text-xs" style={{ color: 'var(--c-text-muted)' }}>{t.description}</p>
                    </div>
                  </button>
                ))}
                <div className="px-3 py-1.5" style={{ borderTop: '1px solid var(--c-border)' }}>
                  <p className="text-xs" style={{ color: 'var(--c-text-muted)' }}>Ctrl+Shift+T to cycle</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Tab Bar ── */}
      <nav
        className="flex flex-shrink-0 overflow-x-auto"
        style={{
          backgroundColor: 'var(--c-bg-nav)',
          borderBottom: '1px solid var(--c-border)',
        }}
      >
        {TABS.map(({ id, label, Icon, requiresData }) => {
          const disabled = requiresData && !hasData;
          const active   = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => !disabled && setActiveTab(id)}
              disabled={disabled}
              className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap"
              style={{
                borderBottomColor: active ? 'var(--c-tab-active-b)' : 'transparent',
                backgroundColor:   active ? 'var(--c-tab-active-bg)' : 'transparent',
                color: active
                  ? 'var(--c-tab-active-t)'
                  : disabled
                  ? 'var(--c-text-muted)'
                  : 'var(--c-text-secondary)',
                cursor:  disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.45 : 1,
              }}
            >
              <Icon className="w-4 h-4" />
              {label}
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
        <div
          className="fixed bottom-4 right-4 flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm max-w-sm z-50"
          style={{
            backgroundColor:
              notification.type === 'success' ? '#16a34a' :
              notification.type === 'error'   ? '#dc2626' : '#2563eb',
            color:  '#ffffff',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
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

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs"
      style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
      <span className="font-bold" style={{ color: 'var(--c-stat-hl)' }}>{value}</span>
      <span style={{ color: 'var(--c-header-sub)' }}>{label}</span>
    </div>
  );
}

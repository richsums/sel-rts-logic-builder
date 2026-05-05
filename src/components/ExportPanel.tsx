import React, { useState } from 'react';
import { Download, Package, FileText, BarChart3, FileJson, Archive, AlertTriangle } from 'lucide-react';
import { useProjectStore } from '../store/project';
import { useUIStore } from '../store/ui';
import { buildExportPackage, downloadBlob } from '../export/package';
import { buildTraceabilityCSV, buildCoverageJSON, buildProjectJSON } from '../export/formats';

export function ExportPanel() {
  const { relay, testCases, scripts, coverage } = useProjectStore();
  const { showNotification } = useUIStore();
  const [exporting, setExporting] = useState(false);

  const invalid = scripts.filter(s => s.validationErrors && s.validationErrors.length > 0);
  const validScripts = scripts.filter(s => !(s.validationErrors && s.validationErrors.length > 0));
  const approved = validScripts.filter(s => s.approved);
  const rejected = scripts.filter(s => !s.approved);

  const handleExportZip = async () => {
    if (!relay || !coverage) {
      showNotification('error', 'No project data to export');
      return;
    }
    setExporting(true);
    try {
      const blob = await buildExportPackage(relay, testCases, approved, coverage);
      const tag = relay.tag ?? 'RELAY';
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      downloadBlob(blob, `${tag}_RTS_Scripts_${ts}.zip`);
      showNotification('success', `Exported ${approved.length} approved scripts`);
    } catch (err) {
      showNotification('error', `Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  };

  const handleExportCSV = () => {
    if (!relay) return;
    const csv = buildTraceabilityCSV(testCases, relay);
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(blob, 'traceability.csv');
    showNotification('info', 'Traceability matrix exported');
  };

  const handleExportCoverage = () => {
    if (!coverage) return;
    const json = buildCoverageJSON(coverage);
    const blob = new Blob([json], { type: 'application/json' });
    downloadBlob(blob, 'coverage.json');
    showNotification('info', 'Coverage report exported');
  };

  const handleExportProject = () => {
    if (!relay || !coverage) return;
    const json = buildProjectJSON(relay, scripts, coverage);
    const blob = new Blob([json], { type: 'application/json' });
    downloadBlob(blob, 'project.json');
    showNotification('info', 'Project file exported');
  };

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const json = ev.target?.result as string;
        useProjectStore.getState().loadProject(json);
        showNotification('success', 'Project loaded successfully');
      } catch {
        showNotification('error', 'Invalid project file');
      }
    };
    reader.readAsText(file);
  };

  if (!relay) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        <div className="text-center">
          <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p>No project data. Import a settings file first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Export Package</h2>
      <p className="text-slate-500 mb-6">
        Bundle approved scripts with traceability matrix and coverage report into a ZIP archive.
      </p>

      {/* Invalid scripts warning */}
      {invalid.length > 0 && (
        <div className="mb-5 rounded-lg p-4 bg-red-50 border border-red-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-700">{invalid.length} script{invalid.length > 1 ? 's' : ''} excluded — validation errors</p>
            <p className="text-sm text-red-600 mt-0.5">
              These scripts have validation errors and will not be included in the export:&nbsp;
              {invalid.map(s => s.label).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Scripts', value: scripts.length, color: 'text-slate-700' },
          { label: 'Approved', value: approved.length, color: 'text-green-600' },
          { label: 'Invalid', value: invalid.length, color: invalid.length > 0 ? 'text-red-600' : 'text-slate-400' },
          { label: 'Coverage', value: coverage ? `${coverage.coveragePercent}%` : '—', color: 'text-blue-600' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-xs text-slate-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Main ZIP Export */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 mb-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Archive className="w-5 h-5" />
              <h3 className="font-bold text-lg">Full Export Package (.zip)</h3>
            </div>
            <p className="text-blue-100 text-sm mb-1">
              Contains all {approved.length} valid approved RTS scripts, traceability.csv, coverage.json, project.json
              {invalid.length > 0 && <span className="ml-1 text-red-200">· {invalid.length} invalid excluded</span>}
            </p>
            <ul className="text-xs text-blue-200 list-disc list-inside">
              <li>rts-scripts/ — {approved.length} .rts files (valid + approved only)</li>
              <li>traceability.csv — script ↔ setting ↔ source line</li>
              <li>coverage.json — signal coverage report</li>
              <li>project.json — full project state</li>
            </ul>
          </div>
          <button
            onClick={handleExportZip}
            disabled={exporting || approved.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-white text-blue-700 rounded-lg hover:bg-blue-50 transition-colors font-semibold text-sm disabled:opacity-50 flex-shrink-0"
          >
            {exporting ? (
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {exporting ? 'Building…' : 'Download ZIP'}
          </button>
        </div>
      </div>

      {/* Individual Exports */}
      <h3 className="font-semibold text-slate-700 mb-3">Individual Exports</h3>
      <div className="space-y-2">
        {[
          { icon: FileText, label: 'Traceability Matrix', desc: 'traceability.csv — script ↔ setting ↔ source line mapping', action: handleExportCSV, disabled: testCases.length === 0 },
          { icon: BarChart3, label: 'Coverage Report', desc: 'coverage.json — signals tested, patterns used, untested signals', action: handleExportCoverage, disabled: !coverage },
          { icon: FileJson, label: 'Project File', desc: 'project.json — full project state for reload', action: handleExportProject, disabled: !relay },
        ].map(item => (
          <div key={item.label} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl">
            <div className="flex items-start gap-3">
              <item.icon className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-slate-800 text-sm">{item.label}</p>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </div>
            </div>
            <button
              onClick={item.action}
              disabled={item.disabled}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />Export
            </button>
          </div>
        ))}
      </div>

      {/* Load Project */}
      <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <h3 className="font-semibold text-slate-700 mb-2">Load Existing Project</h3>
        <p className="text-sm text-slate-500 mb-3">Reload a previously saved project.json file to continue reviewing.</p>
        <label className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer inline-flex text-sm font-medium text-slate-700 w-fit">
          <FileJson className="w-4 h-4" />
          Open project.json
          <input type="file" accept=".json" className="hidden" onChange={handleLoadProject} />
        </label>
      </div>

      {/* Coverage Detail */}
      {coverage && (
        <div className="mt-6 p-4 bg-white border border-slate-200 rounded-xl">
          <h3 className="font-semibold text-slate-700 mb-3">Coverage Detail</h3>
          <div className="mb-3">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-600">Signal Coverage</span>
              <span className="font-semibold text-slate-800">{coverage.coveragePercent}%</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${coverage.coveragePercent}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500 text-xs mb-1">Patterns Used</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(coverage.patternCounts).filter(([,v]) => v > 0).map(([p, c]) => (
                  <span key={p} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">
                    {p}: {c}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-slate-500 text-xs mb-1">Untested Signals ({coverage.untestedSignals.length})</p>
              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                {coverage.untestedSignals.map(s => (
                  <span key={s} className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-xs font-mono">{s}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

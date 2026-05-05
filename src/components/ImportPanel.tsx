import React, { useCallback, useRef, useState } from 'react';
import { Upload, FileText, Zap, AlertCircle, CheckCircle, FlaskConical, List } from 'lucide-react';
import { useProjectStore } from '../store/project';
import { useUIStore } from '../store/ui';
import { detectSEL351 }  from '../relay-adapters/sel351';
import { detectSEL411L } from '../relay-adapters/sel411l';
import { detectSEL421 }  from '../relay-adapters/sel421';
import { detectSEL451 }  from '../relay-adapters/sel451';
import { detectSEL711 }  from '../relay-adapters/sel711';
import { detectSEL751 }  from '../relay-adapters/sel751';
import { detectSEL787 }  from '../relay-adapters/sel787';
import { detectSEL2411 } from '../relay-adapters/sel2411';
import { parseSEL351 }   from '../relay-adapters/sel351';
import { parseSEL411L }  from '../relay-adapters/sel411l';
import { parseSEL421 }   from '../relay-adapters/sel421';
import { parseSEL451 }   from '../relay-adapters/sel451';
import { parseSEL711 }   from '../relay-adapters/sel711';
import { parseSEL751 }   from '../relay-adapters/sel751';
import { parseSEL787 }   from '../relay-adapters/sel787';
import { parseSEL2411 }  from '../relay-adapters/sel2411';
import type { DetectionResult, RelayModelId } from '../relay-adapters/common/types';

/** Parse a file using the best-matching adapter. */
function parseWithModel(text: string, model: RelayModelId, filename: string) {
  switch (model) {
    case 'SEL-411L': return parseSEL411L(text, filename);
    case 'SEL-421':  return parseSEL421(text, filename);
    case 'SEL-451':  return parseSEL451(text, filename);
    case 'SEL-711':  return parseSEL711(text, filename);
    case 'SEL-751':  return parseSEL751(text, filename);
    case 'SEL-787':  return parseSEL787(text, filename);
    case 'SEL-2411': return parseSEL2411(text, filename);
    default:          return parseSEL351(text, filename);
  }
}

/** All detectors in order of specificity. */
const DETECTORS = [
  detectSEL411L, detectSEL421, detectSEL451,
  detectSEL711,  detectSEL751, detectSEL787,
  detectSEL2411, detectSEL351,
];

export function ImportPanel() {
  const [dragging,   setDragging]   = useState(false);
  const [processing, setProcessing] = useState(false);
  const [detection,  setDetection]  = useState<DetectionResult | null>(null);
  const [filename,   setFilename]   = useState<string | null>(null);
  const [importError, setImportError] = useState<{ message: string; line?: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { addRelayProject, loadDemo, projects } = useProjectStore();
  const { setActiveTab, showNotification } = useUIStore();

  const processFile = useCallback(async (file: File) => {
    setProcessing(true);
    setFilename(file.name);
    setImportError(null);
    setDetection(null);

    try {
      const text = await file.text();

      if (!text.trim()) {
        throw new Error('File is empty or unreadable.');
      }

      // Run all detectors, pick best
      const results = DETECTORS.map(d => d(text));
      const best = results.reduce((a, b) => b.confidence > a.confidence ? b : a);
      setDetection(best);

      if (best.confidence < 0.05) {
        setImportError({ message: 'Could not identify relay model. Ensure the file is a valid SEL settings .txt export.' });
        setProcessing(false);
        return;
      }

      const relay = parseWithModel(text, best.model, file.name);

      if (relay.importError) {
        setImportError({ message: relay.importError });
        setProcessing(false);
        return;
      }

      if (relay.logicEquations.length === 0) {
        showNotification('info', `Imported ${relay.model} (${relay.tag}) — no SELOGIC equations found. Check the [SELOGIC] section.`);
      }

      const project = addRelayProject(relay);
      showNotification('success',
        `Imported ${relay.model} (${relay.tag}) — ${relay.logicEquations.length} equations → ${project.scripts.length} scripts`);
      setActiveTab('settings');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportError({ message: `Parse error: ${msg}` });
      showNotification('error', msg);
    } finally {
      setProcessing(false);
    }
  }, [addRelayProject, setActiveTab, showNotification]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Import Relay Settings</h2>
      <p className="text-slate-500 mb-6 text-sm">
        Upload an SEL relay settings <code>.txt</code> file. All 8 supported models auto-detected.
      </p>

      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer mb-5
          ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={onFileChange} />
        {processing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
            <p className="text-blue-600 font-medium">Parsing {filename}…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-10 h-10 text-slate-400" />
            <p className="text-slate-600 font-medium">Drop settings file here</p>
            <p className="text-slate-400 text-sm">or click to browse — accepts .txt files</p>
          </div>
        )}
      </div>

      {/* Import Error */}
      {importError && (
        <div className="mb-5 rounded-lg p-4 bg-red-50 border border-red-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-700">Import Failed</p>
            <p className="text-sm text-red-600 mt-0.5">{importError.message}</p>
            {importError.line && <p className="text-xs text-red-500 mt-1">Near line {importError.line}</p>}
          </div>
        </div>
      )}

      {/* Detection result */}
      {detection && filename && !importError && (
        <div className={`rounded-lg p-4 mb-5 border ${detection.detected ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-start gap-3">
            {detection.detected
              ? <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              : <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />}
            <div>
              <p className="font-semibold text-slate-800">
                {detection.detected ? `Detected: ${detection.model}` : 'Model detection uncertain'}{' '}
                <span className="text-sm font-normal text-slate-500">({Math.round(detection.confidence * 100)}% confidence)</span>
              </p>
              <p className="text-sm text-slate-600 mt-0.5">{filename}</p>
              {detection.hints.slice(0, 3).map((h, i) => (
                <p key={i} className="text-xs text-slate-500">· {h}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Demo section */}
      <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <FlaskConical className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-slate-700">Demo Project (8 Relay Instances)</h3>
        </div>
        <p className="text-sm text-slate-500 mb-3">
          Load all 8 supported relay models pre-configured with SELogic — SEL-351 FDR01 through SEL-2411 PAC01.
          Graph defaults to the SEL-421 POTT scheme.
        </p>
        <button
          onClick={() => {
            loadDemo();
            showNotification('success', '8 relay instances loaded — SEL-421 DTR01 POTT scheme active');
            setActiveTab('graph');
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Zap className="w-4 h-4" />
          Load All Demo Relays
        </button>
        {projects.length > 0 && (
          <p className="text-xs text-slate-400 mt-2">{projects.length} project{projects.length > 1 ? 's' : ''} currently loaded</p>
        )}
      </div>

      {/* Supported models grid */}
      <h3 className="font-semibold text-slate-700 mb-3 text-sm flex items-center gap-2">
        <List className="w-4 h-4" />Supported Models
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { model: 'SEL-351',  desc: 'Overcurrent',     el: '50/51/67' },
          { model: 'SEL-411L', desc: 'Line Differential',el: '87L/21/51' },
          { model: 'SEL-421',  desc: 'Distance (POTT)',  el: '21/67/POTT' },
          { model: 'SEL-451',  desc: 'Distance+OC',      el: '21/51/SOTF' },
          { model: 'SEL-711',  desc: 'Feeder+79',        el: '50/51/79' },
          { model: 'SEL-751',  desc: 'Feeder+SEF',       el: '50/51/67/SEF' },
          { model: 'SEL-787',  desc: 'Transformer Diff', el: '87T/51N/REF' },
          { model: 'SEL-2411', desc: 'PAC Controller',   el: 'Custom logic' },
        ].map(m => (
          <div key={m.model} className="bg-white rounded-lg p-3 border border-slate-200">
            <div className="flex items-center gap-1.5 mb-0.5">
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-mono font-semibold text-slate-800 text-xs">{m.model}</span>
            </div>
            <p className="text-xs text-slate-500">{m.desc}</p>
            <p className="text-xs text-slate-400">{m.el}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

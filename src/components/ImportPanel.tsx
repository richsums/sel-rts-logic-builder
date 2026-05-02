import React, { useCallback, useRef, useState } from 'react';
import { Upload, FileText, Zap, AlertCircle, CheckCircle, FlaskConical } from 'lucide-react';
import { useProjectStore } from '../store/project';
import { useUIStore } from '../store/ui';
import { detectSEL351 } from '../relay-adapters/sel351';
import { detectSEL751 } from '../relay-adapters/sel751';
import { detectSEL451 } from '../relay-adapters/sel451';
import { parseSEL351 } from '../relay-adapters/sel351';
import { parseSEL751 } from '../relay-adapters/sel751';
import { parseSEL451 } from '../relay-adapters/sel451';
import { buildDependencyGraph } from '../selogic/graph';
import { generateAllTestCases } from '../test-engine/generator';
import { buildCoverageReport } from '../test-engine/coverage';
import { renderAllScripts } from '../rts/renderer';
import type { DetectionResult } from '../relay-adapters/common/types';
import type { ScriptRecord } from '../export/formats';
import { v4 as uuidv4 } from 'uuid';

export function ImportPanel() {
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { setRelay, setGraph, setTestCases, setScripts, setCoverage, loadDemo } = useProjectStore();
  const { setActiveTab, showNotification } = useUIStore();

  const processFile = useCallback(async (file: File) => {
    setProcessing(true);
    setFilename(file.name);
    try {
      const text = await file.text();

      // Detect relay model
      const detections = [
        detectSEL351(text),
        detectSEL751(text),
        detectSEL451(text),
      ];
      const best = detections.reduce((a, b) => b.confidence > a.confidence ? b : a);
      setDetection(best);

      // Parse
      let relay;
      if (best.model === 'SEL-751') relay = parseSEL751(text, file.name);
      else if (best.model === 'SEL-451') relay = parseSEL451(text, file.name);
      else relay = parseSEL351(text, file.name);

      setRelay(relay);

      // Build graph
      const graph = buildDependencyGraph(relay.logicEquations);
      setGraph(graph);

      // Generate test cases
      const cases = generateAllTestCases(relay.logicEquations, graph);
      setTestCases(cases);

      // Render scripts
      const rendered = renderAllScripts(cases, relay);
      const records: ScriptRecord[] = rendered.map((r, i) => ({
        id: uuidv4(),
        label: cases[i]?.label ?? `Script ${i + 1}`,
        pattern: cases[i]?.pattern ?? 'A',
        sourceLines: cases[i]?.sourceLines ?? [],
        content: r.content,
        approved: true,
        modified: false,
        filename: r.filename,
      }));
      setScripts(records);

      // Coverage
      const coverage = buildCoverageReport(cases, graph);
      setCoverage(coverage);

      showNotification('success', `Imported ${relay.model} (${relay.tag}) — ${relay.logicEquations.length} logic equations, ${records.length} scripts generated`);
      setActiveTab('settings');
    } catch (err) {
      showNotification('error', `Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing(false);
    }
  }, [setRelay, setGraph, setTestCases, setScripts, setCoverage, setActiveTab, showNotification]);

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
      <h2 className="text-2xl font-bold text-slate-800 mb-2">Import Relay Settings</h2>
      <p className="text-slate-500 mb-6">
        Upload a SEL relay settings <code>.txt</code> file. Supported models: SEL-351, SEL-751, SEL-451.
      </p>

      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer mb-6
          ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={onFileChange} />
        {processing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full" />
            <p className="text-blue-600 font-medium">Processing {filename}…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="w-12 h-12 text-slate-400" />
            <p className="text-slate-600 font-medium text-lg">Drop settings file here</p>
            <p className="text-slate-400 text-sm">or click to browse — accepts .txt files</p>
          </div>
        )}
      </div>

      {/* Detection Result */}
      {detection && filename && (
        <div className={`rounded-lg p-4 mb-6 border ${detection.detected ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-start gap-3">
            {detection.detected
              ? <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              : <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />}
            <div>
              <p className="font-semibold text-slate-800">
                {detection.detected ? `Detected: ${detection.model}` : 'Model detection uncertain'}&nbsp;
                <span className="text-sm font-normal text-slate-500">({Math.round(detection.confidence * 100)}% confidence)</span>
              </p>
              <p className="text-sm text-slate-600 mt-1">{filename}</p>
              {detection.hints.length > 0 && (
                <ul className="mt-2 text-xs text-slate-500 list-disc list-inside">
                  {detection.hints.slice(0, 3).map((h, i) => <li key={i}>{h}</li>)}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Demo Data */}
      <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
        <div className="flex items-center gap-2 mb-2">
          <FlaskConical className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-slate-700">Try with Demo Data</h3>
        </div>
        <p className="text-sm text-slate-500 mb-3">
          Load a pre-built SEL-351 feeder relay example (FDR01) with 7 logic equations and 3 demo scripts.
        </p>
        <button
          onClick={() => {
            loadDemo();
            showNotification('success', 'Demo project loaded — SEL-351 FDR01 with 7 logic equations');
            setActiveTab('settings');
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Zap className="w-4 h-4" />
          Load Demo Project
        </button>
      </div>

      {/* Supported Models */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        {[
          { model: 'SEL-351', desc: 'Overcurrent Protection', elements: '50/51/67' },
          { model: 'SEL-751', desc: 'Feeder Protection', elements: '50/51/49/AFD' },
          { model: 'SEL-451', desc: 'Distance Protection', elements: '21/67/POTT/PUTT' },
        ].map(m => (
          <div key={m.model} className="bg-white rounded-lg p-4 border border-slate-200">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-slate-800 text-sm">{m.model}</span>
            </div>
            <p className="text-xs text-slate-500">{m.desc}</p>
            <p className="text-xs text-slate-400 mt-1">{m.elements}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

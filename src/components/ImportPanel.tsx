import React, { useCallback, useRef, useState } from 'react';
import {
  Upload, FileText, Zap, AlertCircle, CheckCircle,
  FlaskConical, List, AlertTriangle, ChevronDown,
} from 'lucide-react';
import { useProjectStore } from '../store/project';
import { useUIStore } from '../store/ui';
import { detectSEL351 }  from '../relay-adapters/sel351';
import { detectSEL411L } from '../relay-adapters/sel411l';
import { detectSEL421 }  from '../relay-adapters/sel421';
import { detectSEL451 }  from '../relay-adapters/sel451';
import { detectSEL711 }  from '../relay-adapters/sel711';
import { detectSEL751 }  from '../relay-adapters/sel751';
import { detectSEL787 }  from '../relay-adapters/sel787';
import { detectSEL487B } from '../relay-adapters/sel487b';
import { detectSEL2411 } from '../relay-adapters/sel2411';
import { parseSEL351 }   from '../relay-adapters/sel351';
import { parseSEL411L }  from '../relay-adapters/sel411l';
import { parseSEL421 }   from '../relay-adapters/sel421';
import { parseSEL451 }   from '../relay-adapters/sel451';
import { parseSEL711 }   from '../relay-adapters/sel711';
import { parseSEL751 }   from '../relay-adapters/sel751';
import { parseSEL787 }   from '../relay-adapters/sel787';
import { parseSEL487B }  from '../relay-adapters/sel487b';
import { parseSEL2411 }  from '../relay-adapters/sel2411';
import type { DetectionResult, RelayModelId } from '../relay-adapters/common/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** All detectors in order of specificity. */
const DETECTORS = [
  detectSEL411L, detectSEL421, detectSEL451,
  detectSEL711,  detectSEL751, detectSEL787,
  detectSEL487B, detectSEL2411, detectSEL351,
];

/** Parse concatenated text using the best-matching adapter. */
function parseWithModel(text: string, model: RelayModelId, filename: string) {
  switch (model) {
    case 'SEL-411L': return parseSEL411L(text, filename);
    case 'SEL-421':  return parseSEL421(text, filename);
    case 'SEL-451':  return parseSEL451(text, filename);
    case 'SEL-711':  return parseSEL711(text, filename);
    case 'SEL-751':  return parseSEL751(text, filename);
    case 'SEL-787':  return parseSEL787(text, filename);
    case 'SEL-487B': return parseSEL487B(text, filename);
    case 'SEL-2411': return parseSEL2411(text, filename);
    default:          return parseSEL351(text, filename);
  }
}

/** Extract the value of a KEY=VALUE or KEY,"VALUE" line from raw text. */
function extractInfoValue(text: string, key: string): string | null {
  const re = new RegExp(`^${key}[=,]"?([^"\\r\\n]+)"?`, 'im');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

/** Find the first non-INFO section header in file text. Returns uppercased name. */
function detectFirstSection(text: string): string | null {
  const lines = text.split(/\r?\n/);
  let infoSeen = false;
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^\[([A-Z0-9_]+)\]$/i);
    if (m) {
      const name = m[1].toUpperCase();
      if (name === 'INFO') { infoSeen = true; continue; }
      if (infoSeen) return name;  // first non-INFO section
    }
  }
  return null;
}

// ─── Slot configuration ──────────────────────────────────────────────────────

type SlotKey = 'element' | 'logic' | 'global';

interface SlotConfig {
  key: SlotKey;
  label: string;
  emoji: string;
  description: string;
  exampleFile: string;
  sectionLabel: string;
  /** Section name patterns that belong in this slot */
  matchSection: (name: string) => boolean;
  /** Human-readable section examples */
  sectionHint: string;
}

const SLOT_CONFIGS: SlotConfig[] = [
  {
    key: 'element',
    label: 'Element Settings',
    emoji: '⚡',
    description: 'Pickup values, curve types, time dials, zone reaches, CT/PT ratios',
    exampleFile: 'Set_1_2.txt',
    sectionLabel: '[1] Protection Group Settings',
    matchSection: n => /^[1-6]$/.test(n),
    sectionHint: '[1]–[6]',
  },
  {
    key: 'logic',
    label: 'Logic Settings',
    emoji: '🔀',
    description: 'Trip equations, output contacts, latch/timer assignments, 52A mapping',
    exampleFile: 'Set_L1_2.txt',
    sectionLabel: '[L1] SELogic Equations',
    matchSection: n => /^L[1-6]$/.test(n),
    sectionHint: '[L1]–[L6]',
  },
  {
    key: 'global',
    label: 'Global Settings',
    emoji: '⚙️',
    description: 'Relay ID, frequency, phase rotation, input debounce times',
    exampleFile: 'Set_G_2.txt',
    sectionLabel: '[G] General Settings',
    matchSection: n => n === 'G' || n === 'A',
    sectionHint: '[G] / [A]',
  },
];

// ─── Per-slot state ───────────────────────────────────────────────────────────

interface SlotState {
  text: string | null;
  filename: string | null;
  detectedSection: string | null;
  detectedModel: RelayModelId | null;
  fid: string | null;
  relayType: string | null;
  lineCount: number;
  sizeKb: number;
  error: string | null;
  warning: string | null;
  dragging: boolean;
}

const emptySlot = (): SlotState => ({
  text: null, filename: null, detectedSection: null,
  detectedModel: null, fid: null, relayType: null,
  lineCount: 0, sizeKb: 0, error: null, warning: null, dragging: false,
});

// ─── Component ────────────────────────────────────────────────────────────────

export function ImportPanel() {
  const [slots, setSlots] = useState<Record<SlotKey, SlotState>>({
    element: emptySlot(),
    logic:   emptySlot(),
    global:  emptySlot(),
  });
  const [processing, setProcessing] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);

  const fileRefs: Record<SlotKey, React.RefObject<HTMLInputElement>> = {
    element: useRef<HTMLInputElement>(null),
    logic:   useRef<HTMLInputElement>(null),
    global:  useRef<HTMLInputElement>(null),
  };

  const { addRelayProject, loadDemo, projects } = useProjectStore();
  const { setActiveTab, showNotification } = useUIStore();

  // ── Load a file into a slot ──
  const loadSlot = useCallback(async (slotKey: SlotKey, file: File) => {
    const cfg = SLOT_CONFIGS.find(s => s.key === slotKey)!;
    const text = await file.text();
    const lineCount = text.split(/\r?\n/).length;
    const sizeKb = Math.round(file.size / 1024 * 10) / 10;

    // Detect relay model
    const results = DETECTORS.map(d => d(text));
    const best = results.reduce((a, b) => b.confidence > a.confidence ? b : a);
    const detectedModel = best.confidence >= 0.05 ? best.model : null;

    // Extract INFO values
    const fid       = extractInfoValue(text, 'FID');
    const relayType = extractInfoValue(text, 'RELAYTYPE');

    // Find first non-INFO section
    const detectedSection = detectFirstSection(text);

    // Validate: is this the right file for this slot?
    let warning: string | null = null;
    if (detectedSection) {
      const isCorrectSlot = cfg.matchSection(detectedSection);
      if (!isCorrectSlot) {
        const correctCfg = SLOT_CONFIGS.find(s => s.matchSection(detectedSection));
        if (correctCfg) {
          warning = `This looks like a "${correctCfg.label}" file ([${detectedSection}] section found) — did you mean to drop it in the ${correctCfg.label} slot?`;
        }
      }
    }

    const error = !text.trim() ? 'File is empty or unreadable.' : null;

    setSlots(prev => ({
      ...prev,
      [slotKey]: {
        text: error ? null : text,
        filename: file.name,
        detectedSection,
        detectedModel,
        fid,
        relayType,
        lineCount,
        sizeKb,
        error,
        warning,
        dragging: false,
      },
    }));
  }, []);

  // ── Drag/drop and file-change handlers per slot ──
  const makeDropHandler = (key: SlotKey) => (e: React.DragEvent) => {
    e.preventDefault();
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], dragging: false } }));
    const file = e.dataTransfer.files[0];
    if (file) loadSlot(key, file);
  };

  const makeFileChangeHandler = (key: SlotKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadSlot(key, file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const setDragging = (key: SlotKey, val: boolean) =>
    setSlots(prev => ({ ...prev, [key]: { ...prev[key], dragging: val } }));

  // ── Parse & Import ──
  const allSlotsReady = Object.values(slots).every(s => s.text !== null && !s.error);

  const handleImport = useCallback(async () => {
    if (!allSlotsReady) return;
    setProcessing(true);
    setImportError(null);
    setImportSummary(null);

    try {
      // FID consistency check
      const fids = [slots.element.fid, slots.logic.fid, slots.global.fid].filter(Boolean);
      const uniqueFids = new Set(fids);
      if (uniqueFids.size > 1) {
        const fidList = [...uniqueFids].join(', ');
        // Not a hard block — just warn in the summary
        console.warn(`Multi-file import: FID mismatch detected — ${fidList}`);
      }

      // Detect relay model from any slot (prefer element file)
      const bestSlot = [slots.element, slots.logic, slots.global]
        .find(s => s.detectedModel !== null) ?? slots.element;
      const model = bestSlot.detectedModel ?? 'SEL-351';

      // Concatenate all three file texts and parse as one
      const combinedFilenames = [slots.element.filename, slots.logic.filename, slots.global.filename]
        .filter(Boolean).join(' + ');
      const combinedText = [slots.global.text, slots.element.text, slots.logic.text]
        .filter(Boolean).join('\n');

      const relay = parseWithModel(combinedText, model, combinedFilenames);

      if (relay.importError) {
        setImportError(relay.importError);
        setProcessing(false);
        return;
      }

      const totalSettings = relay.settingGroups.reduce((n, g) => n + g.entries.length, 0);
      const isMerged = uniqueFids.size > 1;
      const fidWarning = isMerged ? ' ⚠ FID mismatch — verify files are from the same relay' : '';

      const project = addRelayProject(relay);
      const summary = `Imported ${relay.model} · ${relay.tag} · ${relay.settingGroups.length} sections · ${totalSettings} settings parsed · ${relay.logicEquations.length} equations → ${project.scripts.length} scripts${fidWarning}`;
      setImportSummary(summary);
      showNotification('success', summary.replace(/ · /g, ' — ').replace(' ⚠', ''));
      setActiveTab('settings');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportError(`Parse error: ${msg}`);
      showNotification('error', msg);
    } finally {
      setProcessing(false);
    }
  }, [allSlotsReady, slots, addRelayProject, setActiveTab, showNotification]);

  // ── FID mismatch warning (shown before import) ──
  const loadedFids = Object.values(slots).map(s => s.fid).filter(Boolean);
  const fidMismatch = loadedFids.length > 1 && new Set(loadedFids).size > 1;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-1">Import Relay Settings</h2>
      <p className="text-slate-500 mb-6 text-sm">
        Upload one settings file per category. SEL relays export separate files for element,
        logic, and global settings — load all three to build a complete model.
      </p>

      {/* Three file slots */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        {SLOT_CONFIGS.map(cfg => {
          const slot = slots[cfg.key];
          const ref  = fileRefs[cfg.key];
          const isReady   = slot.text !== null && !slot.error;
          const hasWarning = slot.warning !== null && !slot.error;
          return (
            <div key={cfg.key} className="flex flex-col">
              {/* Slot header */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-base">{cfg.emoji}</span>
                <span className="font-semibold text-slate-700 text-sm">{cfg.label}</span>
                {isReady && <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />}
              </div>

              {/* Drop zone */}
              <div
                className={`flex-1 border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer min-h-[140px] flex flex-col items-center justify-center gap-2
                  ${slot.dragging   ? 'border-blue-500 bg-blue-50' :
                    slot.error      ? 'border-red-300 bg-red-50' :
                    hasWarning      ? 'border-amber-300 bg-amber-50' :
                    isReady         ? 'border-green-300 bg-green-50' :
                    'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}
                onDragOver={e  => { e.preventDefault(); setDragging(cfg.key, true); }}
                onDragLeave={() => setDragging(cfg.key, false)}
                onDrop={makeDropHandler(cfg.key)}
                onClick={() => ref.current?.click()}
              >
                <input
                  ref={ref}
                  type="file"
                  accept=".txt"
                  className="hidden"
                  onChange={makeFileChangeHandler(cfg.key)}
                />

                {isReady ? (
                  <>
                    <CheckCircle className="w-6 h-6 text-green-500" />
                    <p className="font-medium text-green-700 text-sm truncate max-w-full px-1">{slot.filename}</p>
                    <p className="text-xs text-green-600 font-mono">
                      ✓ [{slot.detectedSection}] section found
                    </p>
                    <p className="text-xs text-slate-400">{slot.lineCount} lines · {slot.sizeKb} KB</p>
                    <p className="text-xs text-slate-400 mt-0.5">Click to replace</p>
                  </>
                ) : slot.error ? (
                  <>
                    <AlertCircle className="w-6 h-6 text-red-500" />
                    <p className="text-sm text-red-700 font-medium">{slot.filename}</p>
                    <p className="text-xs text-red-600">{slot.error}</p>
                  </>
                ) : slot.filename && hasWarning ? (
                  <>
                    <AlertTriangle className="w-6 h-6 text-amber-500" />
                    <p className="text-sm text-amber-700 font-medium truncate max-w-full px-1">{slot.filename}</p>
                    <p className="text-xs text-amber-600 text-left px-1">{slot.warning}</p>
                    <p className="text-xs text-slate-400 mt-1">Click to replace</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-slate-400" />
                    <p className="text-slate-500 text-xs font-medium">{cfg.sectionLabel}</p>
                    <p className="text-slate-400 text-xs">{cfg.description}</p>
                    <p className="text-slate-300 text-xs mt-1">e.g. {cfg.exampleFile}</p>
                  </>
                )}
              </div>

              {/* Expected section hint */}
              <p className="text-xs text-slate-400 mt-1 text-center">
                Expected: <code className="text-slate-500">{cfg.sectionHint}</code>
              </p>
            </div>
          );
        })}
      </div>

      {/* FID mismatch warning */}
      {fidMismatch && (
        <div className="mb-4 rounded-lg p-3 bg-amber-50 border border-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-700">
            <strong>FID mismatch</strong> — these files appear to be from different relays. Verify before importing.
          </p>
        </div>
      )}

      {/* Import error */}
      {importError && (
        <div className="mb-4 rounded-lg p-4 bg-red-50 border border-red-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-700">Import Failed</p>
            <p className="text-sm text-red-600 mt-0.5">{importError}</p>
          </div>
        </div>
      )}

      {/* Import success */}
      {importSummary && !importError && (
        <div className="mb-4 rounded-lg p-4 bg-green-50 border border-green-200 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-green-700 font-medium">{importSummary}</p>
        </div>
      )}

      {/* Parse & Import button */}
      <button
        onClick={handleImport}
        disabled={!allSlotsReady || processing}
        className={`w-full py-3 rounded-xl font-semibold text-sm mb-6 flex items-center justify-center gap-2 transition-all
          ${allSlotsReady && !processing
            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
            : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
      >
        {processing ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Parsing & merging 3 files…
          </>
        ) : (
          <>
            <Zap className="w-4 h-4" />
            {allSlotsReady ? 'Parse & Import (3 files → 1 relay model)' : `Load all 3 files to enable import (${Object.values(slots).filter(s => s.text !== null).length}/3 loaded)`}
          </>
        )}
      </button>

      {/* Demo section */}
      <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <FlaskConical className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-slate-700">Demo Project (8 Relay Instances)</h3>
        </div>
        <p className="text-sm text-slate-500 mb-3">
          Load all supported relay models pre-configured with SELogic — SEL-351 FDR01 through SEL-2411 PAC01.
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
          { model: 'SEL-351',  desc: 'Overcurrent',      el: '50/51/67' },
          { model: 'SEL-411L', desc: 'Line Differential', el: '87L/21/51' },
          { model: 'SEL-421',  desc: 'Distance (POTT)',   el: '21/67/POTT' },
          { model: 'SEL-451',  desc: 'Distance+OC',       el: '21/51/SOTF' },
          { model: 'SEL-711',  desc: 'Feeder+79',         el: '50/51/79' },
          { model: 'SEL-751',  desc: 'Feeder+SEF',        el: '50/51/67/SEF' },
          { model: 'SEL-787',  desc: 'Transformer Diff',  el: '87T/51N/REF' },
          { model: 'SEL-487B', desc: 'Bus Differential',  el: '87B/50BF/CZ' },
          { model: 'SEL-2411', desc: 'PAC Controller',    el: 'Custom logic' },
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

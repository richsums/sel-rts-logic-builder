import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { ParsedRelaySettings } from '../relay-adapters/common/types';
import type { DependencyGraph } from '../selogic/graph';
import type { GeneratedTestCase } from '../test-engine/generator';
import type { CoverageReport } from '../test-engine/coverage';
import type { ScriptRecord } from '../export/formats';
import { DEMO_PROJECT } from './demo-data';

export interface ProjectState {
  // Relay settings
  relay: ParsedRelaySettings | null;
  graph: DependencyGraph | null;
  testCases: GeneratedTestCase[];
  scripts: ScriptRecord[];
  coverage: CoverageReport | null;

  // Actions
  setRelay: (relay: ParsedRelaySettings) => void;
  setGraph: (graph: DependencyGraph) => void;
  setTestCases: (cases: GeneratedTestCase[]) => void;
  setScripts: (scripts: ScriptRecord[]) => void;
  updateScript: (id: string, updates: Partial<ScriptRecord>) => void;
  setCoverage: (coverage: CoverageReport) => void;
  approveScript: (id: string) => void;
  rejectScript: (id: string) => void;
  updateScriptContent: (id: string, content: string) => void;
  loadDemo: () => void;
  reset: () => void;
  saveProject: () => string;
  loadProject: (json: string) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  relay: null,
  graph: null,
  testCases: [],
  scripts: [],
  coverage: null,

  setRelay: (relay) => set({ relay }),
  setGraph: (graph) => set({ graph }),
  setTestCases: (testCases) => set({ testCases }),
  setScripts: (scripts) => set({ scripts }),
  setCoverage: (coverage) => set({ coverage }),

  updateScript: (id, updates) =>
    set(state => ({
      scripts: state.scripts.map(s => s.id === id ? { ...s, ...updates } : s),
    })),

  approveScript: (id) =>
    set(state => ({
      scripts: state.scripts.map(s => s.id === id ? { ...s, approved: true } : s),
    })),

  rejectScript: (id) =>
    set(state => ({
      scripts: state.scripts.map(s => s.id === id ? { ...s, approved: false } : s),
    })),

  updateScriptContent: (id, content) =>
    set(state => ({
      scripts: state.scripts.map(s =>
        s.id === id ? { ...s, content, modified: true } : s
      ),
    })),

  loadDemo: () => set(DEMO_PROJECT),

  reset: () => set({
    relay: null,
    graph: null,
    testCases: [],
    scripts: [],
    coverage: null,
  }),

  saveProject: () => {
    const { relay, scripts, coverage } = get();
    return JSON.stringify({
      version: '1.0',
      created: new Date().toISOString(),
      relay: relay ? {
        model: relay.model,
        tag: relay.tag,
        sourceFile: relay.sourceFile,
        lineCount: relay.lineCount,
      } : null,
      scripts,
      coverage,
    }, null, 2);
  },

  loadProject: (json) => {
    try {
      const data = JSON.parse(json);
      if (data.scripts) set({ scripts: data.scripts });
      if (data.coverage) set({ coverage: data.coverage });
    } catch (e) {
      console.error('Failed to load project:', e);
    }
  },
}));

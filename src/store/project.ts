/**
 * @module store/project
 * Zustand store for the multi-relay project state.
 * Supports multiple relay instances; one is "active" at a time.
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { ParsedRelaySettings } from '../relay-adapters/common/types';
import type { DependencyGraph } from '../selogic/graph';
import type { GeneratedTestCase } from '../test-engine/generator';
import type { CoverageReport } from '../test-engine/coverage';
import type { ScriptRecord } from '../export/formats';
import { buildDependencyGraph } from '../selogic/graph';
import { generateAllTestCases } from '../test-engine/generator';
import { buildCoverageReport } from '../test-engine/coverage';
import { renderAllAnalogScripts } from '../rts/analog-renderer';
import { ALL_DEMO_RELAYS } from './demo-data';

// ─── Types ────────────────────────────────────────────────────────────────────

/** One complete relay project instance (relay + derived artefacts). */
export interface RelayProject {
  id: string;
  relay: ParsedRelaySettings;
  graph: DependencyGraph;
  testCases: GeneratedTestCase[];
  scripts: ScriptRecord[];
  coverage: CoverageReport;
}

export interface ProjectState {
  /** All relay projects loaded (demo + user-imported). */
  projects: RelayProject[];
  /** ID of the currently viewed project. */
  activeProjectId: string | null;

  // ── Computed conveniences (derived from activeProject) ──
  relay: ParsedRelaySettings | null;
  graph: DependencyGraph | null;
  testCases: GeneratedTestCase[];
  scripts: ScriptRecord[];
  coverage: CoverageReport | null;

  // ── Actions ──────────────────────────────────────────────
  /** Build a project from parsed relay settings and add it as the active project. */
  addRelayProject: (relay: ParsedRelaySettings) => RelayProject;
  /** Switch the active project. */
  setActiveProject: (id: string) => void;
  /** Update a script within the active project. */
  updateScript: (id: string, updates: Partial<ScriptRecord>) => void;
  updateScriptContent: (id: string, content: string) => void;
  approveScript: (id: string) => void;
  rejectScript: (id: string) => void;
  /** Load all 8 demo relay instances as projects. */
  loadDemo: () => void;
  /** Reset to empty state. */
  reset: () => void;
  /** Serialise the active project to JSON. */
  saveProject: () => string;
  /** Load scripts/coverage back from a project JSON file. */
  loadProject: (json: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a complete RelayProject from parsed relay settings. */
function buildProject(relay: ParsedRelaySettings): RelayProject {
  const graph     = buildDependencyGraph(relay.logicEquations);
  const testCases = generateAllTestCases(relay.logicEquations, graph);
  const rendered  = renderAllAnalogScripts(testCases, relay);
  const scripts: ScriptRecord[] = rendered.map((r, i) => ({
    id: uuidv4(),
    label: testCases[i]?.label ?? `Script ${i + 1}`,
    pattern: testCases[i]?.pattern ?? 'A',
    sourceLines: testCases[i]?.sourceLines ?? [],
    content: r.content,
    approved: true,
    modified: false,
    filename: r.filename,
    validationErrors: [],
    validationWarnings: [],
  }));
  const coverage = buildCoverageReport(testCases, graph);
  return { id: uuidv4(), relay, graph, testCases, scripts, coverage };
}

/** Sync the flat convenience fields from the active project. */
function withActive(state: Omit<ProjectState, 'relay' | 'graph' | 'testCases' | 'scripts' | 'coverage'>): Partial<ProjectState> {
  const active = (state as ProjectState).projects.find(p => p.id === (state as ProjectState).activeProjectId);
  return {
    relay:     active?.relay     ?? null,
    graph:     active?.graph     ?? null,
    testCases: active?.testCases ?? [],
    scripts:   active?.scripts   ?? [],
    coverage:  active?.coverage  ?? null,
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects:        [],
  activeProjectId: null,
  relay:     null,
  graph:     null,
  testCases: [],
  scripts:   [],
  coverage:  null,

  addRelayProject: (relay) => {
    const project = buildProject(relay);
    set(state => {
      const projects = [...state.projects, project];
      return { projects, activeProjectId: project.id, ...activeFields(projects, project.id) };
    });
    return project;
  },

  setActiveProject: (id) =>
    set(state => ({ activeProjectId: id, ...activeFields(state.projects, id) })),

  updateScript: (id, updates) =>
    set(state => ({
      ...updateInActive(state, id, updates),
    })),

  updateScriptContent: (id, content) =>
    set(state => ({
      ...updateInActive(state, id, { content, modified: true }),
    })),

  approveScript: (id) =>
    set(state => ({ ...updateInActive(state, id, { approved: true }) })),

  rejectScript: (id) =>
    set(state => ({ ...updateInActive(state, id, { approved: false }) })),

  loadDemo: () => {
    const projects = ALL_DEMO_RELAYS.map(buildProject);
    // Default active = SEL-421 (index 2) — most complex POTT scheme
    const activeId = projects[2]?.id ?? projects[0]?.id ?? null;
    set({
      projects,
      activeProjectId: activeId,
      ...activeFields(projects, activeId),
    });
  },

  reset: () => set({
    projects: [], activeProjectId: null,
    relay: null, graph: null, testCases: [], scripts: [], coverage: null,
  }),

  saveProject: () => {
    const { projects, activeProjectId } = get();
    const active = projects.find(p => p.id === activeProjectId);
    if (!active) return '{}';
    return JSON.stringify({
      version: '1.0',
      created: new Date().toISOString(),
      relay: { model: active.relay.model, tag: active.relay.tag, sourceFile: active.relay.sourceFile, lineCount: active.relay.lineCount },
      scripts: active.scripts,
      coverage: active.coverage,
    }, null, 2);
  },

  loadProject: (json) => {
    try {
      const data = JSON.parse(json) as { scripts?: ScriptRecord[]; coverage?: CoverageReport };
      const { projects, activeProjectId } = get();
      if (!activeProjectId) return;
      set({
        projects: projects.map(p => {
          if (p.id !== activeProjectId) return p;
          return {
            ...p,
            scripts: data.scripts ?? p.scripts,
            coverage: data.coverage ?? p.coverage,
          };
        }),
        scripts: data.scripts ?? get().scripts,
        coverage: data.coverage ?? get().coverage,
      });
    } catch (e) {
      console.error('Failed to load project:', e);
    }
  },
}));

// ─── Internal helpers ─────────────────────────────────────────────────────────

function activeFields(projects: RelayProject[], activeId: string | null): Partial<ProjectState> {
  const a = projects.find(p => p.id === activeId);
  return {
    relay:     a?.relay     ?? null,
    graph:     a?.graph     ?? null,
    testCases: a?.testCases ?? [],
    scripts:   a?.scripts   ?? [],
    coverage:  a?.coverage  ?? null,
  };
}

function updateInActive(
  state: ProjectState,
  scriptId: string,
  updates: Partial<ScriptRecord>,
): Partial<ProjectState> {
  const { projects, activeProjectId } = state;
  const updated = projects.map(p => {
    if (p.id !== activeProjectId) return p;
    const scripts = p.scripts.map(s => s.id === scriptId ? { ...s, ...updates } : s);
    return { ...p, scripts };
  });
  const active = updated.find(p => p.id === activeProjectId);
  return { projects: updated, scripts: active?.scripts ?? state.scripts };
}

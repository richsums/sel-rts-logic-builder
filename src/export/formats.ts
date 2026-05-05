/**
 * @module export/formats
 * Build traceability CSV, coverage JSON, and project JSON for export.
 */

import type { GeneratedTestCase } from '../test-engine/generator';
import type { CoverageReport } from '../test-engine/coverage';
import type { ParsedRelaySettings } from '../relay-adapters/common/types';

// ─── ScriptRecord ─────────────────────────────────────────────────────────────

/** A generated (or user-edited) RTS script with review status. */
export interface ScriptRecord {
  id: string;
  label: string;
  pattern: string;
  sourceLines: number[];
  content: string;
  approved: boolean;
  modified: boolean;
  filename: string;
  /** Validation errors — scripts with errors are excluded from export */
  validationErrors: string[];
  validationWarnings: string[];
}

// ─── Traceability Matrix (CSV) ────────────────────────────────────────────────

/**
 * Build a traceability CSV mapping each script to its source setting and line number.
 */
export function buildTraceabilityCSV(
  testCases: GeneratedTestCase[],
  relay: ParsedRelaySettings,
): string {
  const rows: string[] = [
    'Script,Label,Pattern,Source File,Source Line,Signals Referenced',
  ];
  for (const tc of testCases) {
    const filename = `${relay.tag}_${tc.label}_Pat${tc.pattern}.rts`;
    rows.push(
      [filename, tc.label, tc.pattern, relay.sourceFile,
       tc.sourceLines.join(';'), tc.signals.join(';')]
        .map(v => `"${v}"`).join(','),
    );
  }
  return rows.join('\n');
}

// ─── Coverage Report (JSON) ───────────────────────────────────────────────────

/** Serialise a CoverageReport to JSON string. */
export function buildCoverageJSON(report: CoverageReport): string {
  return JSON.stringify(report, null, 2);
}

// ─── Project File (JSON) ──────────────────────────────────────────────────────

export interface ProjectFile {
  version: '1.0';
  created: string;
  relay: {
    model: string;
    tag: string;
    settings: Record<string, unknown>;
    sourceFile: string;
    lineCount: number;
  };
  scripts: ScriptRecord[];
  coverage: CoverageReport;
}

/** Build a full project.json serialisation. */
export function buildProjectJSON(
  relay: ParsedRelaySettings,
  scripts: ScriptRecord[],
  coverage: CoverageReport,
): string {
  const project: ProjectFile = {
    version: '1.0',
    created: new Date().toISOString(),
    relay: {
      model: relay.model,
      tag: relay.tag,
      settings: {},
      sourceFile: relay.sourceFile,
      lineCount: relay.lineCount,
    },
    scripts,
    coverage,
  };
  return JSON.stringify(project, null, 2);
}

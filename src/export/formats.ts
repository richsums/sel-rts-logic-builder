import type { GeneratedTestCase } from '../test-engine/generator';
import type { CoverageReport } from '../test-engine/coverage';
import type { ParsedRelaySettings } from '../relay-adapters/common/types';

// ─── Traceability Matrix (CSV) ────────────────────────────────────────────────

export function buildTraceabilityCSV(
  testCases: GeneratedTestCase[],
  relay: ParsedRelaySettings
): string {
  const rows: string[] = [
    'Script,Label,Pattern,Source File,Source Line,Signals Referenced',
  ];

  for (const tc of testCases) {
    const filename = `${relay.tag}_${tc.label}_Pat${tc.pattern}.rts`;
    rows.push(
      [
        filename,
        tc.label,
        tc.pattern,
        relay.sourceFile,
        tc.sourceLines.join(';'),
        tc.signals.join(';'),
      ].map(v => `"${v}"`).join(',')
    );
  }

  return rows.join('\n');
}

// ─── Coverage Report (JSON) ───────────────────────────────────────────────────

export function buildCoverageJSON(report: CoverageReport): string {
  return JSON.stringify(report, null, 2);
}

// ─── Project File (JSON) ──────────────────────────────────────────────────────

export interface ScriptRecord {
  id: string;
  label: string;
  pattern: string;
  sourceLines: number[];
  content: string;
  approved: boolean;
  modified: boolean;
  filename: string;
}

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

export function buildProjectJSON(
  relay: ParsedRelaySettings,
  scripts: ScriptRecord[],
  coverage: CoverageReport
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

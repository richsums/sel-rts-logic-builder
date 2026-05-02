import JSZip from 'jszip';
import type { ScriptRecord } from './formats';
import { buildTraceabilityCSV, buildCoverageJSON, buildProjectJSON } from './formats';
import type { CoverageReport } from '../test-engine/coverage';
import type { ParsedRelaySettings } from '../relay-adapters/common/types';
import type { GeneratedTestCase } from '../test-engine/generator';

export async function buildExportPackage(
  relay: ParsedRelaySettings,
  testCases: GeneratedTestCase[],
  scripts: ScriptRecord[],
  coverage: CoverageReport
): Promise<Blob> {
  const zip = new JSZip();

  const approvedScripts = scripts.filter(s => s.approved);

  // RTS scripts
  const rtsFolder = zip.folder('rts-scripts')!;
  for (const script of approvedScripts) {
    rtsFolder.file(script.filename, script.content);
  }

  // Traceability matrix
  zip.file('traceability.csv', buildTraceabilityCSV(testCases, relay));

  // Coverage report
  zip.file('coverage.json', buildCoverageJSON(coverage));

  // Project file
  zip.file('project.json', buildProjectJSON(relay, scripts, coverage));

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

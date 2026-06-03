import type { SettingEntry, SettingGroup, SourceRef } from './types';

/** Split raw file text into lines preserving original line numbers (1-based) */
export function splitLines(text: string): Array<{ line: string; lineNumber: number }> {
  return text.split(/\r?\n/).map((line, i) => ({ line, lineNumber: i + 1 }));
}

/** Strip comment portions (after // or ;) from a line */
export function stripComment(line: string): string {
  // SEL uses ";" for comments in some sections
  const semiIdx = line.indexOf(';');
  const slashIdx = line.indexOf('//');
  let cutAt = line.length;
  if (semiIdx !== -1) cutAt = Math.min(cutAt, semiIdx);
  if (slashIdx !== -1) cutAt = Math.min(cutAt, slashIdx);
  return line.slice(0, cutAt).trim();
}

/** Detect section header like "[SELOGIC]" or "=MAIN=" */
export function parseSectionHeader(line: string): string | null {
  const bracketMatch = line.match(/^\[([A-Z0-9_]+)\]/i);
  if (bracketMatch) return bracketMatch[1].toUpperCase();
  const equalMatch = line.match(/^=+([A-Z0-9_]+)=+/i);
  if (equalMatch) return equalMatch[1].toUpperCase();
  return null;
}

/**
 * Parse a setting line in either of the two SEL formats:
 *   Format 1 (settings sections):  KEY,"VALUE"   e.g.  TR,"51P1T+51G1T"
 *   Format 2 (INFO section):       KEY=VALUE     e.g.  RELAYTYPE=SEL-351S-6
 */
export function parseKeyValue(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('*') || trimmed.startsWith(';')) return null;

  // Format 1: KEY,"VALUE"  (settings sections use comma + quoted value)
  const csvMatch = trimmed.match(/^([A-Z0-9_]+),\s*"([^"]*)"$/i);
  if (csvMatch) return { key: csvMatch[1].toUpperCase(), value: csvMatch[2] };

  // Format 2: KEY=VALUE  (INFO section and some legacy formats)
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx < 1) return null;
  const key = trimmed.slice(0, eqIdx).trim().toUpperCase();
  const value = trimmed.slice(eqIdx + 1).trim();
  if (!key) return null;
  return { key, value };
}

/** Build a SettingGroup from raw lines within a section */
export function buildSettingGroup(
  name: string,
  rawLines: Array<{ line: string; lineNumber: number }>,
  sourceFile: string
): SettingGroup {
  const headerLine = rawLines[0] ?? { line: `[${name}]`, lineNumber: 0 };
  const entries: SettingEntry[] = [];

  for (const { line, lineNumber } of rawLines.slice(1)) {
    const stripped = stripComment(line);
    if (!stripped) continue;
    const kv = parseKeyValue(stripped);
    if (!kv) continue;
    entries.push({
      key: kv.key,
      value: kv.value,
      source: { sourceFile, lineNumber, rawText: line },
    });
  }

  return {
    name,
    entries,
    source: { sourceFile, lineNumber: headerLine.lineNumber, rawText: headerLine.line },
  };
}

/** Find a setting value by key in a list of groups */
export function findSetting(groups: SettingGroup[], key: string): SettingEntry | undefined {
  for (const group of groups) {
    const found = group.entries.find(e => e.key === key.toUpperCase());
    if (found) return found;
  }
  return undefined;
}

/** Make a SourceRef */
export function makeRef(sourceFile: string, lineNumber: number, rawText: string): SourceRef {
  return { sourceFile, lineNumber, rawText };
}

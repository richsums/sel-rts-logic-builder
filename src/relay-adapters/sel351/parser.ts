import type { ParsedRelaySettings, SettingGroup, LogicEquation, LogicFunctionType } from '../common/types';
import { splitLines, parseSectionHeader, buildSettingGroup, findSetting } from '../common/parser-utils';
import { SEL351_LOGIC_LABELS } from './model';

function inferFunctionType(label: string): LogicFunctionType {
  const u = label.toUpperCase();
  if (u === 'TR' || u === 'TRIP' || u.endsWith('T') && (u.includes('51') || u.includes('50') || u.includes('67'))) return 'TRIP';
  if (u === 'CL' || u === 'CLOSE') return 'OUTPUT';
  if (u.endsWith('TC')) return 'TIMER_IN';
  if (u.endsWith('S') && u.startsWith('LT')) return 'LATCH_SET';
  if (u.endsWith('R') && u.startsWith('LT')) return 'LATCH_RESET';
  if (u.startsWith('OUT')) return 'OUTPUT';
  if (u === 'ALARM') return 'ALARM';
  if (u.startsWith('50') || u.startsWith('67')) return 'PICKUP';
  if (u.startsWith('51')) return 'PICKUP';
  return 'GENERAL';
}

export function parseSEL351(text: string, filename: string): ParsedRelaySettings {
  const allLines = splitLines(text);
  const rawLines = allLines.map(l => l.line);

  // Split into sections
  const sections: Array<{ name: string; lines: Array<{ line: string; lineNumber: number }> }> = [];
  let currentSection: { name: string; lines: Array<{ line: string; lineNumber: number }> } | null = null;

  for (const { line, lineNumber } of allLines) {
    const header = parseSectionHeader(line.trim());
    if (header) {
      if (currentSection) sections.push(currentSection);
      currentSection = { name: header, lines: [{ line, lineNumber }] };
    } else if (currentSection) {
      currentSection.lines.push({ line, lineNumber });
    } else {
      // Lines before first section go into a synthetic MAIN
      if (!currentSection) {
        currentSection = { name: 'MAIN', lines: [{ line: '[MAIN]', lineNumber: 0 }] };
      }
      currentSection.lines.push({ line, lineNumber });
    }
  }
  if (currentSection) sections.push(currentSection);

  // Build setting groups
  const settingGroups: SettingGroup[] = sections.map(s =>
    buildSettingGroup(s.name, s.lines, filename)
  );

  // Extract tag from MAIN
  const mainGroup = settingGroups.find(g => g.name === 'MAIN');
  const tag = findSetting(settingGroups, 'TAG')?.value
    ?? findSetting(settingGroups, 'RID')?.value
    ?? 'RELAY-01';
  const firmware = findSetting(settingGroups, 'FW')?.value
    ?? findSetting(settingGroups, 'FID')?.value
    ?? 'Unknown';

  // Extract logic equations from SELOGIC, SET, L1-L6 (logic), and 1-6 (protection group) sections
  const logicEquations: LogicEquation[] = [];
  for (const group of settingGroups) {
    const isLogicSection =
      group.name.includes('SELOGIC') ||
      group.name.includes('SET') ||
      /^L[1-6]$/.test(group.name) ||   // [L1]–[L6] logic settings
      /^[1-6]$/.test(group.name);       // [1]–[6] protection group settings
    if (!isLogicSection) continue;
    for (const entry of group.entries) {
      // Logic equations have known labels or look like signal assignments
      const isLogic =
        entry.key in SEL351_LOGIC_LABELS ||
        /^(TR|CL|TRIP|CLOSE|ALARM|OUT\d+|LT\d[SR]|M\d+|\d+(P|G|N|Q)\d*(TC|T|S|R)?|67[PGN]\d*)$/.test(entry.key);

      if (isLogic || entry.value.match(/[A-Z0-9]+\s*[+*!|&]/i)) {
        logicEquations.push({
          label: entry.key,
          expression: entry.value,
          description: SEL351_LOGIC_LABELS[entry.key] ?? entry.key,
          source: entry.source,
          functionType: inferFunctionType(entry.key),
        });
      }
    }
  }

  return {
    model: 'SEL-351',
    tag,
    firmware,
    settingGroups,
    logicEquations,
    rawLines,
    sourceFile: filename,
    lineCount: allLines.length,
  };
}

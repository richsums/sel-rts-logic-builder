import type { ParsedRelaySettings, LogicEquation, LogicFunctionType } from '../common/types';
import { parseSEL351 } from '../sel351/parser';
import { SEL487B_LOGIC_LABELS } from './model';

function inferFunctionType487B(label: string): LogicFunctionType {
  const u = label.toUpperCase();
  if (u === 'TR' || u === 'TRIP') return 'TRIP';
  // Bus diff trip outputs: 87BT, 87B1T, 87B2T
  if (/^87B\d*T$/.test(u)) return 'TRIP';
  // Bus diff pickup/supervisory elements
  if (/^87B/.test(u) || /^CZ87B/.test(u)) return 'DIFFERENTIAL';
  // Breaker failure trip
  if (/^50BFT/.test(u)) return 'TRIP';
  // Breaker failure pickup
  if (/^50BF/.test(u)) return 'PICKUP';
  if (u === 'CL' || u === 'CLOSE') return 'OUTPUT';
  if (u.startsWith('OUT')) return 'OUTPUT';
  if (u.endsWith('TC')) return 'TIMER_IN';
  if (u.endsWith('S') && u.startsWith('LT')) return 'LATCH_SET';
  if (u.endsWith('R') && u.startsWith('LT')) return 'LATCH_RESET';
  if (u === 'ALARM' || u === 'HARMS') return 'ALARM';
  if (u.startsWith('50') || u.startsWith('51') || u.startsWith('67')) return 'PICKUP';
  return 'GENERAL';
}

function is487BLogicEntry(key: string, value: string): boolean {
  // Standard trip/output/latch/timer labels
  if (/^(TR|CL|TRIP|CLOSE|ALARM|OUT\d+|LT\d[SR]|M\d+)$/.test(key)) return true;
  // 87B bus differential (any sub-label)
  if (/^87B/i.test(key)) return true;
  // Check zone bus differential
  if (/^CZ87B/i.test(key)) return true;
  // Breaker failure (50BF, 50BF1, 50BFT, 50BFTC, …)
  if (/^50BF/i.test(key)) return true;
  // Harmonic restraint
  if (/^HARMS$/i.test(key)) return true;
  // Standard OC elements (51P1T, 50G1, 51P1TC, etc.) — extend to include B suffix
  if (/^\d+(P|G|N|Q|B)\d*(TC|T|S|R)?$/.test(key)) return true;
  // Directional elements
  if (/^67[PGN]\d*$/.test(key)) return true;
  // Anything already in the label dictionary
  if (key in SEL487B_LOGIC_LABELS) return true;
  // Looks like a SELOGIC expression (at least one operator)
  if (/[A-Z][A-Z0-9_]*\s*[+*!|&]/i.test(value)) return true;
  return false;
}

export function parseSEL487B(text: string, filename: string): ParsedRelaySettings {
  const base = parseSEL351(text, filename);

  // Re-scan all groups with extended 487B patterns to catch labels the SEL-351
  // regex misses (87B*, CZ87B*, 50BF*, and non-standard section names).
  const seen = new Set(base.logicEquations.map(e => e.label));
  const extra: LogicEquation[] = [];

  for (const group of base.settingGroups) {
    const isCandidateSection =
      group.name.includes('SELOGIC') ||
      group.name.includes('SET') ||
      /^L[1-6]$/.test(group.name) ||    // [L1]–[L6] logic
      /^[1-6]$/.test(group.name) ||     // [1]–[6] protection groups
      /^87B/i.test(group.name) ||       // [87B] bus diff section
      /^BF/i.test(group.name) ||        // [BF] breaker failure section
      /^CZ/i.test(group.name) ||        // [CZ] check zone section
      group.name.toUpperCase() === 'P87'; // [P87] differential port settings

    if (!isCandidateSection) continue;

    for (const entry of group.entries) {
      if (seen.has(entry.key)) continue;
      if (is487BLogicEntry(entry.key, entry.value)) {
        extra.push({
          label: entry.key,
          expression: entry.value,
          description: SEL487B_LOGIC_LABELS[entry.key] ?? entry.key,
          source: entry.source,
          functionType: inferFunctionType487B(entry.key),
        });
        seen.add(entry.key);
      }
    }
  }

  // Re-label equations already captured by the base parser with 487B descriptions
  const relabeled = base.logicEquations.map(eq => ({
    ...eq,
    description: SEL487B_LOGIC_LABELS[eq.label] ?? eq.description,
    functionType: inferFunctionType487B(eq.label),
  }));

  return {
    ...base,
    model: 'SEL-487B',
    logicEquations: [...relabeled, ...extra],
  };
}

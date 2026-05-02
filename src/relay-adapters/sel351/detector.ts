import type { DetectionResult } from '../common/types';
import { splitLines } from '../common/parser-utils';

export function detectSEL351(text: string): DetectionResult {
  const lines = splitLines(text).slice(0, 30).map(l => l.line.toUpperCase());
  const hints: string[] = [];
  let score = 0;

  for (const line of lines) {
    if (line.includes('SEL-351') || line.includes('SEL351')) { score += 0.6; hints.push('Found SEL-351 in header'); }
    if (line.includes('OVERCURRENT') && line.includes('RELAY')) { score += 0.2; hints.push('OC relay descriptor'); }
    if (line.includes('51P') || line.includes('51G') || line.includes('51N')) { score += 0.15; hints.push('OC element labels'); }
    if (line.includes('50P') || line.includes('50G')) { score += 0.1; hints.push('Instantaneous OC labels'); }
    if (line.includes('67') || line.includes('DIRECTIONAL')) { score += 0.1; hints.push('Directional element'); }
    if (line.includes('[SELOGIC]') || line.includes('[SET1]') || line.includes('[MAIN]')) { score += 0.1; hints.push('SEL section header'); }
  }

  const confidence = Math.min(score, 1);
  return {
    detected: confidence >= 0.3,
    model: 'SEL-351',
    confidence,
    hints,
  };
}

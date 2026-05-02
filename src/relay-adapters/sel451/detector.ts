import type { DetectionResult } from '../common/types';
import { splitLines } from '../common/parser-utils';

export function detectSEL451(text: string): DetectionResult {
  const lines = splitLines(text).slice(0, 30).map(l => l.line.toUpperCase());
  const hints: string[] = [];
  let score = 0;
  for (const line of lines) {
    if (line.includes('SEL-451') || line.includes('SEL451')) { score += 0.6; hints.push('Found SEL-451 in header'); }
    if (line.includes('TRANSMISSION') || line.includes('DISTANCE')) { score += 0.2; hints.push('Distance protection'); }
    if (line.includes('21') || line.includes('ZONE')) { score += 0.15; hints.push('Zone element'); }
    if (line.includes('[SELOGIC]') || line.includes('[SET')) { score += 0.1; hints.push('SEL section header'); }
  }
  return { detected: Math.min(score,1) >= 0.3, model: 'SEL-451', confidence: Math.min(score,1), hints };
}

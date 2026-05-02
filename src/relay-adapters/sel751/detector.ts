import type { DetectionResult } from '../common/types';
import { splitLines } from '../common/parser-utils';

export function detectSEL751(text: string): DetectionResult {
  const lines = splitLines(text).slice(0, 30).map(l => l.line.toUpperCase());
  const hints: string[] = [];
  let score = 0;
  for (const line of lines) {
    if (line.includes('SEL-751') || line.includes('SEL751')) { score += 0.6; hints.push('Found SEL-751 in header'); }
    if (line.includes('FEEDER') && line.includes('PROTECTION')) { score += 0.2; hints.push('Feeder protection descriptor'); }
    if (line.includes('49') || line.includes('THERMAL')) { score += 0.15; hints.push('Thermal element'); }
    if (line.includes('[SELOGIC]') || line.includes('[SET')) { score += 0.1; hints.push('SEL section header'); }
  }
  return { detected: Math.min(score,1) >= 0.3, model: 'SEL-751', confidence: Math.min(score,1), hints };
}

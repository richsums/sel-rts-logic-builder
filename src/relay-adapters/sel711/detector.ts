import type { DetectionResult } from '../common/types';
import { scoreDetection } from '../common/detect-helpers';

/** Detect SEL-711 feeder protection relay. */
export function detectSEL711(text: string): DetectionResult {
  return scoreDetection(text, 'SEL-711', [
    { keyword: 'SEL-711', score: 0.7, hint: 'SEL-711 in header' },
    { keyword: 'SEL711',  score: 0.7, hint: 'SEL711 variant' },
    { keyword: 'RECLOSE', score: 0.15, hint: 'Recloser logic' },
    { keyword: '79',      score: 0.15, hint: '79 reclosing element' },
    { keyword: 'FEEDER',  score: 0.1,  hint: 'Feeder descriptor' },
    { keyword: '[SELOGIC]',score: 0.05, hint: 'SEL section' },
  ]);
}

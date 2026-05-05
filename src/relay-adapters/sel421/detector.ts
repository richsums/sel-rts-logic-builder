import type { DetectionResult } from '../common/types';
import { scoreDetection } from '../common/detect-helpers';

/** Detect SEL-421 distance relay. */
export function detectSEL421(text: string): DetectionResult {
  return scoreDetection(text, 'SEL-421', [
    { keyword: 'SEL-421', score: 0.7, hint: 'SEL-421 in header' },
    { keyword: 'SEL421',  score: 0.7, hint: 'SEL421 variant' },
    { keyword: 'POTT',    score: 0.2, hint: 'POTT scheme' },
    { keyword: 'PUTT',    score: 0.2, hint: 'PUTT scheme' },
    { keyword: 'MHO',     score: 0.15, hint: 'Mho characteristic' },
    { keyword: 'ZONE1',   score: 0.1,  hint: 'Zone 1 element' },
    { keyword: '[SELOGIC]',score: 0.05, hint: 'SEL section header' },
  ]);
}

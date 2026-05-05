import type { DetectionResult } from '../common/types';
import { scoreDetection } from '../common/detect-helpers';

/** Detect SEL-787 transformer differential relay. */
export function detectSEL787(text: string): DetectionResult {
  return scoreDetection(text, 'SEL-787', [
    { keyword: 'SEL-787', score: 0.7, hint: 'SEL-787 in header' },
    { keyword: 'SEL787',  score: 0.7, hint: 'SEL787 variant' },
    { keyword: '87T',     score: 0.25, hint: 'Transformer differential 87T' },
    { keyword: 'TRANSFORMER', score: 0.15, hint: 'Transformer descriptor' },
    { keyword: 'REF',     score: 0.1,  hint: 'Restricted earth fault' },
    { keyword: '[SELOGIC]',score: 0.05, hint: 'SEL section' },
  ]);
}

import type { DetectionResult } from '../common/types';
import { scoreDetection } from '../common/detect-helpers';

/** Detect SEL-411L line-differential relay from settings file header. */
export function detectSEL411L(text: string): DetectionResult {
  return scoreDetection(text, 'SEL-411L', [
    { keyword: 'SEL-411L', score: 0.7, hint: 'SEL-411L in header' },
    { keyword: 'SEL411L',  score: 0.7, hint: 'SEL411L variant' },
    { keyword: '87L',      score: 0.25, hint: 'Line differential element 87L' },
    { keyword: 'LINE DIFF',score: 0.2,  hint: 'Line differential descriptor' },
    { keyword: '[SELOGIC]',score: 0.05, hint: 'SEL section header' },
  ]);
}

import type { DetectionResult } from '../common/types';
import { scoreDetection } from '../common/detect-helpers';

export function detectSEL487B(text: string): DetectionResult {
  return scoreDetection(text, 'SEL-487B', [
    { keyword: 'SEL-487B',        score: 0.7,  hint: 'SEL-487B in header' },
    { keyword: 'SEL487B',         score: 0.7,  hint: 'SEL487B variant' },
    { keyword: '487B',            score: 0.5,  hint: '487B model reference' },
    { keyword: 'BUS DIFFERENTIAL',score: 0.25, hint: 'Bus differential descriptor' },
    { keyword: 'BUS DIFF',        score: 0.2,  hint: 'Bus diff abbreviation' },
    { keyword: '87B',             score: 0.2,  hint: '87B bus differential element' },
    { keyword: '50BF',            score: 0.1,  hint: 'Breaker failure element' },
    { keyword: 'CHECK ZONE',      score: 0.1,  hint: 'Check zone protection' },
    { keyword: 'CZ87B',           score: 0.15, hint: 'Check zone bus diff label' },
  ]);
}

import type { DetectionResult } from '../common/types';
import { scoreDetection } from '../common/detect-helpers';

/** Detect SEL-2411 Programmable Automation Controller. */
export function detectSEL2411(text: string): DetectionResult {
  return scoreDetection(text, 'SEL-2411', [
    { keyword: 'SEL-2411', score: 0.7, hint: 'SEL-2411 in header' },
    { keyword: 'SEL2411',  score: 0.7, hint: 'SEL2411 variant' },
    { keyword: 'PAC',      score: 0.2,  hint: 'Programmable Automation Controller' },
    { keyword: 'SELOGIC CONTROL EQUATIONS', score: 0.15, hint: 'PAC control section' },
    { keyword: ':=',       score: 0.1,  hint: 'PAC assignment syntax' },
  ]);
}

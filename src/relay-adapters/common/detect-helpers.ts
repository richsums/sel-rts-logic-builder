import type { DetectionResult, RelayModelId } from './types';
import { splitLines } from './parser-utils';

/**
 * Build a DetectionResult by scanning the first 40 lines of a settings file
 * against a list of weighted keyword matchers.
 */
export function scoreDetection(
  text: string,
  model: RelayModelId,
  matchers: Array<{ keyword: string; score: number; hint: string }>,
  threshold = 0.3,
): DetectionResult {
  const lines = splitLines(text).slice(0, 40).map(l => l.line.toUpperCase());
  const hints: string[] = [];
  let total = 0;

  for (const { keyword, score, hint } of matchers) {
    if (lines.some(l => l.includes(keyword))) {
      total += score;
      hints.push(hint);
    }
  }

  const confidence = Math.min(total, 1);
  return { detected: confidence >= threshold, model, confidence, hints };
}

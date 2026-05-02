import type { ParsedRelaySettings } from '../common/types';
import { parseSEL351 } from '../sel351/parser';
// SEL-751 uses same section structure as SEL-351 — reuse parser with model override
export function parseSEL751(text: string, filename: string): ParsedRelaySettings {
  const result = parseSEL351(text, filename);
  return { ...result, model: 'SEL-751' };
}

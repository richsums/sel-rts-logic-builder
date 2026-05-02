import type { ParsedRelaySettings } from '../common/types';
import { parseSEL351 } from '../sel351/parser';
export function parseSEL451(text: string, filename: string): ParsedRelaySettings {
  const result = parseSEL351(text, filename);
  return { ...result, model: 'SEL-451' };
}

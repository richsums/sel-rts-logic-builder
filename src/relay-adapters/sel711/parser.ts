import type { ParsedRelaySettings } from '../common/types';
import { parseSEL351 } from '../sel351/parser';

/** Parse SEL-711 settings — shares core structure with SEL-351. */
export function parseSEL711(text: string, filename: string): ParsedRelaySettings {
  const base = parseSEL351(text, filename);
  return { ...base, model: 'SEL-711' };
}

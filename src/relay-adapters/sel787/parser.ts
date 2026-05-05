import type { ParsedRelaySettings } from '../common/types';
import { parseSEL351 } from '../sel351/parser';

/** Parse SEL-787 settings — shares core section structure with SEL-351. */
export function parseSEL787(text: string, filename: string): ParsedRelaySettings {
  const base = parseSEL351(text, filename);
  return { ...base, model: 'SEL-787' };
}

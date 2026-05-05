import type { ParsedRelaySettings } from '../common/types';
import { parseSEL351 } from '../sel351/parser';

/**
 * Parse SEL-2411 PAC settings.
 * The PAC uses := assignment syntax, which the core parser normalises to =.
 */
export function parseSEL2411(text: string, filename: string): ParsedRelaySettings {
  // Normalise := to = for compatibility with the base parser
  const normalised = text.replace(/:=/g, '=');
  const base = parseSEL351(normalised, filename);
  return { ...base, model: 'SEL-2411' };
}

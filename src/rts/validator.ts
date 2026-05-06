/**
 * @module rts/validator
 * Validates RTS script content for structural correctness.
 * Accepts both the legacy digital format (SET/CHECK) and the current analog
 * injection format (INJECT/RAMP/PULSE_RAMP/PREFAULT/CHECK ELEMENT/CHECK TIMING).
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateScript(content: string): ValidationResult {
  const errors: string[]   = [];
  const warnings: string[] = [];
  const lines = content.split('\n');

  // Required structural markers
  const hasInit  = lines.some(l => l.trim() === 'INIT');
  const hasEnd   = lines.some(l => l.trim() === 'END');
  const stateCnt = lines.filter(l => l.trim().startsWith('STATE')).length;

  if (!hasInit) errors.push('Missing INIT block');
  if (!hasEnd)  errors.push('Missing END marker');
  if (stateCnt === 0) warnings.push('No STATE blocks found');

  // Assertion check — accept both digital and analog forms:
  //   CHECK <signal> == <value>          (legacy digital)
  //   CHECK ELEMENT <name> == PICKUP|TRIP|RESET
  //   CHECK CONTACT <bit> == 0|1
  //   CHECK TIMING <element> WITHIN <min> <max>
  const hasChecks = lines.some(l => /^\s*CHECK\b/i.test(l));
  if (!hasChecks) {
    warnings.push('No CHECK assertions — test may not verify relay output');
  }

  // Warn if analog injection is absent in scripts that use SET (digital-only)
  const hasInject = lines.some(l => /^\s*INJECT\b/i.test(l));
  const hasSet    = lines.some(l => /^\s*SET\b/i.test(l));
  if (hasSet && !hasInject) {
    warnings.push('Digital SET commands only — consider analog INJECT for protection function tests');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateScript(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = content.split('\n');

  const hasInit = lines.some(l => l.trim() === 'INIT');
  const hasEnd  = lines.some(l => l.trim() === 'END');
  const stateCount = lines.filter(l => l.trim().startsWith('STATE')).length;

  if (!hasInit) errors.push('Missing INIT block');
  if (!hasEnd)  errors.push('Missing END marker');
  if (stateCount === 0) warnings.push('No STATE blocks found');

  // Check for CHECK commands
  const hasChecks = lines.some(l => l.trim().startsWith('CHECK'));
  if (!hasChecks) warnings.push('No CHECK assertions — test may not verify output');

  return { valid: errors.length === 0, errors, warnings };
}

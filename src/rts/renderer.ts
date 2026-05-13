import type { GeneratedTestCase, TestState, TestStep } from '../test-engine/generator';
import type { ParsedRelaySettings } from '../relay-adapters/common/types';

// ─── Computed output guard ────────────────────────────────────────────────────

/**
 * Returns true if the signal name is a relay-computed output that must never
 * appear in a `SET` or `SET BINARY` command.
 *
 * Allowed in SET: binary inputs (IN101, IN201), comms inputs (RxWI, COMM_IN),
 * supervisory contacts (52A, 52B), user-defined controls (RESET, CLOSE).
 *
 * Forbidden in SET (must only assert as a consequence of analog injection):
 *   - TR / TRIP and variants (trip equation output)
 *   - Trip word bits: 50P1T, 51G1T, 21P2T, 87L1T, 79T, etc.
 *   - Pickup bits: 50P1P, 51P1P, 87LP, etc.
 *   - Output contacts: OUT101, OUT201, etc.
 *   - Latch outputs: SV1Q, SV2Q, etc.
 */
export function isComputedOutput(signalName: string): boolean {
  const upper = (signalName ?? '').toUpperCase();
  // Trip word bits: 50P1T, 51G1T, 21P2T, 87L1T, etc. (protection prefix + T suffix)
  if (/^(50|51|21|67|87|79|46|27|59|81)\w*T\d*$/.test(upper)) return true;
  // Pickup bits: 50P1P, 51P1P, 87LP, etc.
  if (/^(50|51|21|67|87|79|46|27|59|81)\w*P\d*$/.test(upper)) return true;
  // TR and variants (trip equation output)
  if (upper === 'TR' || upper.startsWith('TR')) return true;
  // Output contacts
  if (/^OUT\d+$/.test(upper)) return true;
  // Latch outputs
  if (/^SV\d+Q$/.test(upper)) return true;
  return false;
}

// ─── RTS Script Renderer ──────────────────────────────────────────────────────

function renderStep(step: TestStep): string {
  switch (step.type) {
    case 'COMMENT': return `    * ${step.comment}`;
    case 'SET': {
      const sig = step.signal ?? '';
      if (isComputedOutput(sig)) {
        return [
          `    * NOTE: ${sig} is a computed output — assert via analog injection per trip equation`,
          `    * TODO: inject analog quantities to satisfy trip equation for ${sig}`,
        ].join('\n');
      }
      return `    SET ${step.signal} ${step.value}`;
    }
    case 'WAIT':    return `    WAIT ${step.ms}`;
    case 'CHECK':   return `    CHECK ${step.signal} == ${step.value}`;
    default:        return `    * (unknown step)`;
  }
}

function renderState(state: TestState): string {
  const lines = [
    `  STATE ${state.stateNumber}`,
    `    * ${state.description}`,
    ...state.steps.map(renderStep),
  ];
  return lines.join('\n');
}

export function renderRTSScript(
  tc: GeneratedTestCase,
  relay: ParsedRelaySettings
): string {
  const header = [
    `* ═══════════════════════════════════════════════════════════════`,
    `* Script:  ${relay.tag} / ${tc.label} / Pattern ${tc.pattern}`,
    `* Label:   ${tc.description}`,
    `* Relay:   ${relay.model} (${relay.tag})`,
    `* Source:  ${relay.sourceFile} line ${tc.sourceLines[0] ?? 0}`,
    `* Pattern: ${tc.pattern} — ${patternName(tc.pattern)}`,
    `* Generated: ${new Date().toISOString()}`,
    `* ═══════════════════════════════════════════════════════════════`,
    `INIT`,
  ].join('\n');

  const body = tc.states.map(renderState).join('\n');

  return `${header}\n${body}\nEND\n`;
}

function patternName(p: string): string {
  const names: Record<string, string> = {
    A: 'Simple Assertion',
    B: 'Supervised Trip',
    C: 'OR Logic',
    D: 'Latch Set/Reset',
    E: 'Timer',
    F: 'Blocking',
    G: 'Comms-Assisted',
  };
  return names[p] ?? p;
}

export function renderAllScripts(
  testCases: GeneratedTestCase[],
  relay: ParsedRelaySettings
): Array<{ filename: string; content: string }> {
  return testCases.map(tc => ({
    filename: `${relay.tag}_${tc.label}_Pat${tc.pattern}.rts`,
    content: renderRTSScript(tc, relay),
  }));
}

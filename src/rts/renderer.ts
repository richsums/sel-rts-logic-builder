import type { GeneratedTestCase, TestState, TestStep } from '../test-engine/generator';
import type { ParsedRelaySettings } from '../relay-adapters/common/types';

// ─── RTS Script Renderer ──────────────────────────────────────────────────────

function renderStep(step: TestStep): string {
  switch (step.type) {
    case 'COMMENT': return `    * ${step.comment}`;
    case 'SET':     return `    SET ${step.signal} ${step.value}`;
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

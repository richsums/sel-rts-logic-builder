import type { ParsedRelaySettings } from '../relay-adapters/common/types';
import type { DependencyGraph, GraphNode } from '../selogic/graph';
import type { GeneratedTestCase } from '../test-engine/generator';
import type { CoverageReport } from '../test-engine/coverage';
import type { ScriptRecord } from '../export/formats';

// ─── Demo Relay Settings ──────────────────────────────────────────────────────

const DEMO_FILE = 'SEL351_FDR01_Demo.txt';

export const DEMO_RELAY: ParsedRelaySettings = {
  model: 'SEL-351',
  tag: 'FDR01',
  firmware: 'R300-V1',
  settingGroups: [
    {
      name: 'MAIN',
      entries: [
        { key: 'TAG', value: 'FDR01', source: { sourceFile: DEMO_FILE, lineNumber: 2, rawText: 'TAG=FDR01' } },
        { key: 'RID', value: 'FEEDER 01', source: { sourceFile: DEMO_FILE, lineNumber: 3, rawText: 'RID=FEEDER 01' } },
        { key: 'FW', value: 'R300-V1', source: { sourceFile: DEMO_FILE, lineNumber: 4, rawText: 'FW=R300-V1' } },
      ],
      source: { sourceFile: DEMO_FILE, lineNumber: 1, rawText: '[MAIN]' },
    },
    {
      name: 'SET1',
      entries: [
        { key: '51P1P',  value: '5.00',  source: { sourceFile: DEMO_FILE, lineNumber: 10, rawText: '51P1P=5.00' } },
        { key: '51P1TD', value: '0.50',  source: { sourceFile: DEMO_FILE, lineNumber: 11, rawText: '51P1TD=0.50' } },
        { key: '51P1CT', value: 'U1',    source: { sourceFile: DEMO_FILE, lineNumber: 12, rawText: '51P1CT=U1' } },
        { key: '50P1P',  value: '20.00', source: { sourceFile: DEMO_FILE, lineNumber: 13, rawText: '50P1P=20.00' } },
        { key: '51G1P',  value: '1.00',  source: { sourceFile: DEMO_FILE, lineNumber: 14, rawText: '51G1P=1.00' } },
        { key: '51G1TD', value: '0.30',  source: { sourceFile: DEMO_FILE, lineNumber: 15, rawText: '51G1TD=0.30' } },
        { key: '50G1P',  value: '5.00',  source: { sourceFile: DEMO_FILE, lineNumber: 16, rawText: '50G1P=5.00' } },
      ],
      source: { sourceFile: DEMO_FILE, lineNumber: 9, rawText: '[SET1]' },
    },
    {
      name: 'SELOGIC',
      entries: [
        { key: 'TR',     value: '51P1T + 51G1T + 50P1 + 50G1',  source: { sourceFile: DEMO_FILE, lineNumber: 20, rawText: 'TR=51P1T + 51G1T + 50P1 + 50G1' } },
        { key: '51P1TC', value: '51P1',                           source: { sourceFile: DEMO_FILE, lineNumber: 21, rawText: '51P1TC=51P1' } },
        { key: '51G1TC', value: '51G1',                           source: { sourceFile: DEMO_FILE, lineNumber: 22, rawText: '51G1TC=51G1' } },
        { key: 'LT1S',   value: 'TR',                             source: { sourceFile: DEMO_FILE, lineNumber: 23, rawText: 'LT1S=TR' } },
        { key: 'LT1R',   value: 'IN101',                          source: { sourceFile: DEMO_FILE, lineNumber: 24, rawText: 'LT1R=IN101' } },
        { key: 'OUT101', value: 'LT1',                            source: { sourceFile: DEMO_FILE, lineNumber: 25, rawText: 'OUT101=LT1' } },
        { key: 'ALARM',  value: '51P1 + 51G1',                    source: { sourceFile: DEMO_FILE, lineNumber: 26, rawText: 'ALARM=51P1 + 51G1' } },
      ],
      source: { sourceFile: DEMO_FILE, lineNumber: 19, rawText: '[SELOGIC]' },
    },
  ],
  logicEquations: [
    { label: 'TR',     expression: '51P1T + 51G1T + 50P1 + 50G1', description: 'Trip',                    source: { sourceFile: DEMO_FILE, lineNumber: 20, rawText: 'TR=51P1T + 51G1T + 50P1 + 50G1' }, functionType: 'TRIP' },
    { label: '51P1TC', expression: '51P1',                          description: 'Phase OC Timer Control', source: { sourceFile: DEMO_FILE, lineNumber: 21, rawText: '51P1TC=51P1' },                    functionType: 'TIMER_IN' },
    { label: '51G1TC', expression: '51G1',                          description: 'Ground OC Timer Control',source: { sourceFile: DEMO_FILE, lineNumber: 22, rawText: '51G1TC=51G1' },                    functionType: 'TIMER_IN' },
    { label: 'LT1S',   expression: 'TR',                            description: 'Latch 1 Set',            source: { sourceFile: DEMO_FILE, lineNumber: 23, rawText: 'LT1S=TR' },                        functionType: 'LATCH_SET' },
    { label: 'LT1R',   expression: 'IN101',                         description: 'Latch 1 Reset',          source: { sourceFile: DEMO_FILE, lineNumber: 24, rawText: 'LT1R=IN101' },                     functionType: 'LATCH_RESET' },
    { label: 'OUT101', expression: 'LT1',                           description: 'Output Contact 101',     source: { sourceFile: DEMO_FILE, lineNumber: 25, rawText: 'OUT101=LT1' },                     functionType: 'OUTPUT' },
    { label: 'ALARM',  expression: '51P1 + 51G1',                   description: 'Alarm',                  source: { sourceFile: DEMO_FILE, lineNumber: 26, rawText: 'ALARM=51P1 + 51G1' },              functionType: 'ALARM' },
  ],
  rawLines: [],
  sourceFile: DEMO_FILE,
  lineCount: 30,
};

// ─── Demo Graph ───────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<GraphNode> & Pick<GraphNode, 'id' | 'label'>): GraphNode {
  return {
    description: overrides.label,
    isInput: false,
    isOutput: false,
    dependencies: [],
    dependents: [],
    depth: 0,
    ...overrides,
  };
}

const graphNodes = new Map<string, GraphNode>([
  ['51P1',   makeNode({ id:'51P1',   label:'51P1',   description:'Phase OC Pickup',        isInput:true, depth:0, dependents:['51P1TC','ALARM'], dependencies:[] })],
  ['51G1',   makeNode({ id:'51G1',   label:'51G1',   description:'Ground OC Pickup',       isInput:true, depth:0, dependents:['51G1TC','ALARM'], dependencies:[] })],
  ['51P1T',  makeNode({ id:'51P1T',  label:'51P1T',  description:'Phase OC Timer',         isInput:true, depth:1, dependents:['TR'], dependencies:['51P1TC'] })],
  ['51G1T',  makeNode({ id:'51G1T',  label:'51G1T',  description:'Ground OC Timer',        isInput:true, depth:1, dependents:['TR'], dependencies:['51G1TC'] })],
  ['50P1',   makeNode({ id:'50P1',   label:'50P1',   description:'Phase Inst. OC',         isInput:true, depth:0, dependents:['TR'], dependencies:[] })],
  ['50G1',   makeNode({ id:'50G1',   label:'50G1',   description:'Ground Inst. OC',        isInput:true, depth:0, dependents:['TR'], dependencies:[] })],
  ['IN101',  makeNode({ id:'IN101',  label:'IN101',  description:'Hardware Input 101',      isInput:true, depth:0, dependents:['LT1R'], dependencies:[] })],
  ['51P1TC', makeNode({ id:'51P1TC', label:'51P1TC', description:'Phase OC Timer Control', depth:1, dependents:['51P1T'], dependencies:['51P1'] })],
  ['51G1TC', makeNode({ id:'51G1TC', label:'51G1TC', description:'Ground OC Timer Control',depth:1, dependents:['51G1T'], dependencies:['51G1'] })],
  ['TR',     makeNode({ id:'TR',     label:'TR',     description:'Trip',                   isOutput:true, depth:2, dependents:['LT1S'], dependencies:['51P1T','51G1T','50P1','50G1'] })],
  ['ALARM',  makeNode({ id:'ALARM',  label:'ALARM',  description:'Alarm',                  isOutput:true, depth:1, dependents:[], dependencies:['51P1','51G1'] })],
  ['LT1S',   makeNode({ id:'LT1S',   label:'LT1S',   description:'Latch 1 Set',            depth:3, dependents:['OUT101'], dependencies:['TR'] })],
  ['LT1R',   makeNode({ id:'LT1R',   label:'LT1R',   description:'Latch 1 Reset',          depth:1, dependents:['OUT101'], dependencies:['IN101'] })],
  ['OUT101', makeNode({ id:'OUT101', label:'OUT101', description:'Output Contact 101',      isOutput:true, depth:4, dependents:[], dependencies:['LT1S','LT1R'] })],
]);

export const DEMO_GRAPH: DependencyGraph = {
  nodes: graphNodes,
  roots: ['51P1','51G1','50P1','50G1','IN101'],
  leaves: ['TR','ALARM','OUT101'],
};

// ─── Demo Scripts ─────────────────────────────────────────────────────────────

const makeScript = (id: string, label: string, pattern: string, sourceLines: number[], content: string, approved = true): ScriptRecord => ({
  id, label, pattern, sourceLines, content, approved, modified: false,
  filename: `FDR01_${label}_Pat${pattern}.rts`,
});

export const DEMO_SCRIPTS: ScriptRecord[] = [
  makeScript('demo-1', 'TR', 'B', [20],
`* ═══════════════════════════════════════════════════════════════
* Script:  FDR01 / TR / Pattern B
* Label:   Trip
* Relay:   SEL-351 (FDR01)
* Source:  SEL351_FDR01_Demo.txt line 20
* Pattern: B — Supervised Trip
* Generated: ${new Date().toISOString()}
* ═══════════════════════════════════════════════════════════════
INIT
  STATE 1
    * De-energize all inputs
    SET 51P1T 0
    SET 51G1T 0
    SET 50P1 0
    SET 50G1 0
    WAIT 100
    CHECK TR == 0
  STATE 2
    * Assert pickup without supervision — expect no trip
    SET 51P1T 1
    WAIT 50
    CHECK TR == 0
  STATE 3
    * Enable 51G1T also — verify trip asserts (OR logic)
    SET 51G1T 1
    WAIT 100
    CHECK TR == 1
  STATE 4
    * Reset — verify trip clears
    SET 51P1T 0
    SET 51G1T 0
    WAIT 100
    CHECK TR == 0
END
`),

  makeScript('demo-2', '51P1TC', 'E', [21],
`* ═══════════════════════════════════════════════════════════════
* Script:  FDR01 / 51P1TC / Pattern E
* Label:   Phase OC Timer Control
* Relay:   SEL-351 (FDR01)
* Source:  SEL351_FDR01_Demo.txt line 21
* Pattern: E — Timer
* Generated: ${new Date().toISOString()}
* ═══════════════════════════════════════════════════════════════
INIT
  STATE 1
    * Timer test — verify operate delay (TD=0.50s)
    SET 51P1 0
    WAIT 100
    SET 51P1 1
    WAIT 500
    CHECK 51P1TC == 1
  STATE 2
    * Remove timer input — verify dropout
    SET 51P1 0
    WAIT 100
    CHECK 51P1TC == 0
END
`),

  makeScript('demo-3', 'ALARM', 'C', [26],
`* ═══════════════════════════════════════════════════════════════
* Script:  FDR01 / ALARM / Pattern C
* Label:   Alarm
* Relay:   SEL-351 (FDR01)
* Source:  SEL351_FDR01_Demo.txt line 26
* Pattern: C — OR Logic
* Generated: ${new Date().toISOString()}
* ═══════════════════════════════════════════════════════════════
INIT
  STATE 1
    * Branch 1: assert 51P1 only
    SET 51P1 1
    SET 51G1 0
    WAIT 50
    CHECK ALARM == 1
  STATE 2
    * Branch 2: assert 51G1 only
    SET 51P1 0
    SET 51G1 1
    WAIT 50
    CHECK ALARM == 1
  STATE 3
    * Reset all
    SET 51P1 0
    SET 51G1 0
    WAIT 50
    CHECK ALARM == 0
END
`),
];

export const DEMO_TEST_CASES: GeneratedTestCase[] = DEMO_RELAY.logicEquations.map(eq => ({
  id: `tc-${eq.label}`,
  label: eq.label,
  description: eq.description,
  pattern: 'A' as const,
  sourceLines: [eq.source.lineNumber],
  states: [],
  signals: [],
}));

export const DEMO_COVERAGE: CoverageReport = {
  totalSignals: 14,
  testedSignals: ['TR','51P1TC','51G1TC','ALARM','51P1','51G1','50P1','50G1','51P1T','51G1T'],
  untestedSignals: ['LT1S','LT1R','OUT101','IN101'],
  coveragePercent: 71,
  patternCounts: { A: 4, B: 1, C: 1, D: 0, E: 1, F: 0, G: 0 },
  totalTestCases: 7,
};

export const DEMO_PROJECT = {
  relay: DEMO_RELAY,
  graph: DEMO_GRAPH,
  testCases: DEMO_TEST_CASES,
  scripts: DEMO_SCRIPTS,
  coverage: DEMO_COVERAGE,
};

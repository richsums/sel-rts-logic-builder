// ─── Source Traceability ─────────────────────────────────────────────────────

/** Every parsed element carries its origin for full traceability. */
export interface SourceRef {
  sourceFile: string;
  lineNumber: number;
  rawText: string;
}

// ─── Relay Model ─────────────────────────────────────────────────────────────

export type RelayModelId =
  | 'SEL-351'
  | 'SEL-411L'
  | 'SEL-421'
  | 'SEL-451'
  | 'SEL-711'
  | 'SEL-751'
  | 'SEL-787'
  | 'SEL-487B'
  | 'SEL-2411'
  | 'UNKNOWN';

export interface RelayModel {
  id: RelayModelId;
  label: string;
  description: string;
  supportedSections: string[];
}

// ─── Setting Primitives ───────────────────────────────────────────────────────

export interface SettingEntry {
  key: string;
  value: string;
  source: SourceRef;
}

export interface SettingGroup {
  name: string;          // e.g. "MAIN", "SET1", "SELOGIC", "GROUP1"
  entries: SettingEntry[];
  source: SourceRef;
}

// ─── Logic Equation ───────────────────────────────────────────────────────────

export interface LogicEquation {
  label: string;
  expression: string;
  description: string;
  source: SourceRef;
  functionType: LogicFunctionType;
  /** True if the expression could not be parsed cleanly */
  parseError?: boolean;
  parseErrorReason?: string;
}

export type LogicFunctionType =
  | 'TRIP'
  | 'PICKUP'
  | 'BLOCK'
  | 'LATCH_SET'
  | 'LATCH_RESET'
  | 'TIMER_IN'
  | 'TIMER_OUT'
  | 'ALARM'
  | 'OUTPUT'
  | 'RISING_EDGE'
  | 'COMM_ASSISTED'
  | 'DIFFERENTIAL'
  | 'RECLOSER'
  | 'GENERAL';

// ─── Parsed Relay Settings ────────────────────────────────────────────────────

export interface ParsedRelaySettings {
  model: RelayModelId;
  tag: string;
  firmware: string;
  settingGroups: SettingGroup[];
  logicEquations: LogicEquation[];
  rawLines: string[];
  sourceFile: string;
  lineCount: number;
  /** Import-level fatal parse error */
  importError?: string;
}

// ─── Detector Result ─────────────────────────────────────────────────────────

export interface DetectionResult {
  detected: boolean;
  model: RelayModelId;
  confidence: number;
  hints: string[];
}

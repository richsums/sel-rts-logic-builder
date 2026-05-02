// ─── Source Traceability ─────────────────────────────────────────────────────

export interface SourceRef {
  sourceFile: string;
  lineNumber: number;
  rawText: string;
}

// ─── Relay Model ─────────────────────────────────────────────────────────────

export type RelayModelId = 'SEL-351' | 'SEL-751' | 'SEL-451' | 'UNKNOWN';

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
  name: string;          // e.g. "MAIN", "SET1", "SELOGIC"
  entries: SettingEntry[];
  source: SourceRef;     // first line of the section header
}

// ─── Logic Equation ───────────────────────────────────────────────────────────

export interface LogicEquation {
  label: string;         // e.g. "TR" (trip), "51P1T" (OC pickup timer)
  expression: string;    // raw SELogic expression string
  description: string;   // human-readable description
  source: SourceRef;
  functionType: LogicFunctionType;
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
}

// ─── Detector Result ─────────────────────────────────────────────────────────

export interface DetectionResult {
  detected: boolean;
  model: RelayModelId;
  confidence: number;   // 0–1
  hints: string[];
}

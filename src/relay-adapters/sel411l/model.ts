import type { RelayModel } from '../common/types';

export const SEL411L_MODEL: RelayModel = {
  id: 'SEL-411L',
  label: 'SEL-411L Line Differential Relay',
  description: 'Current differential protection for lines with 87L, 21, and 51 elements',
  supportedSections: ['MAIN','SET1','SET2','GROUP1','GROUP2','SELOGIC','PORT'],
};

export const SEL411L_LOGIC_LABELS: Record<string, string> = {
  TR: 'Trip', CL: 'Close',
  '87L': 'Line Differential', '87LP': 'Diff Phase', '87LG': 'Diff Ground',
  '21P1T': 'Zone 1 Phase Trip', '21P2T': 'Zone 2 Phase Trip',
  '51PT': 'Phase OC Trip', '51GT': 'Ground OC Trip',
  '50P': 'Phase Inst. OC', '50G': 'Ground Inst. OC',
  LT1S: 'Latch 1 Set', LT1R: 'Latch 1 Reset',
  SV1S: 'Supervisory Bit 1 Set', SV1R: 'Supervisory Bit 1 Reset',
  OUT101: 'Trip Output', ALARM: 'Alarm',
};

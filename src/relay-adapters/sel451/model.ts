import type { RelayModel } from '../common/types';

export const SEL451_MODEL: RelayModel = {
  id: 'SEL-451',
  label: 'SEL-451 Distance/OC Combo Relay',
  description: '21 distance + 51 OC + SOTF + out-of-step blocking',
  supportedSections: ['MAIN','SET1','SET2','SET3','SELOGIC','PORT','ALIAS'],
};

export const SEL451_LOGIC_LABELS: Record<string, string> = {
  TR: 'Trip', CL: 'Close',
  '21P1T': 'Zone 1 Phase Trip', '21P2T': 'Zone 2 Phase Trip', '21P3T': 'Zone 3 Phase Trip',
  '21G1T': 'Zone 1 Ground Trip',
  '51PT': 'Phase Backup OC Trip', '51GT': 'Ground Backup OC Trip',
  '50P1': 'Phase Inst. OC', '50G1': 'Ground Inst. OC',
  SOTF: 'Switch-Onto-Fault', OSB: 'Out-of-Step Blocking',
  LT1S: 'Latch 1 Set', LT1R: 'Latch 1 Reset',
  BLK21: 'Distance Block',
  OUT101: 'Trip', OUT102: 'Close', ALARM: 'Alarm',
};

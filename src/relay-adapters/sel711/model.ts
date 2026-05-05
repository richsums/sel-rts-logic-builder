import type { RelayModel } from '../common/types';

export const SEL711_MODEL: RelayModel = {
  id: 'SEL-711',
  label: 'SEL-711 Feeder Protection Relay',
  description: 'Feeder protection with 50/51 OC, 79 recloser, and arc-flash detection',
  supportedSections: ['MAIN','SET1','SET2','SELOGIC','RECLOSE','PORT'],
};

export const SEL711_LOGIC_LABELS: Record<string, string> = {
  TR: 'Trip', CL: 'Close',
  '51PT': 'Phase OC Trip', '51GT': 'Ground OC Trip',
  '50P1': 'Phase Inst. 1', '50P2': 'Phase Inst. 2',
  '50G1': 'Ground Inst. 1',
  '79CY': 'Recloser Cycle', '79LO': 'Lockout',
  CLDI: 'Cold Load Inhibit',
  LT1S: 'Latch 1 Set', LT1R: 'Latch 1 Reset',
  OUT101: 'Trip', OUT102: 'Close', ALARM: 'Alarm',
};

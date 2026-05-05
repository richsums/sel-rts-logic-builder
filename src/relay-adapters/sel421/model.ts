import type { RelayModel } from '../common/types';

export const SEL421_MODEL: RelayModel = {
  id: 'SEL-421',
  label: 'SEL-421 Distance Protection Relay',
  description: '3-zone mho distance relay with POTT/PUTT pilot scheme',
  supportedSections: ['MAIN','SET1','SET2','SET3','SELOGIC','PILOT','PORT'],
};

export const SEL421_LOGIC_LABELS: Record<string, string> = {
  TR: 'Trip', CL: 'Close',
  '21P1': 'Zone 1 Phase', '21P2': 'Zone 2 Phase', '21P3': 'Zone 3 Phase',
  '21G1': 'Zone 1 Ground', '21G2': 'Zone 2 Ground', '21G3': 'Zone 3 Ground',
  '67P': 'Phase Directional', '67G': 'Ground Directional',
  POTT: 'Permissive Overreaching Transfer Trip',
  PUTT: 'Permissive Underreaching Transfer Trip',
  TxWI: 'Transmit POTT', RxWI: 'Received POTT',
  BLK21: 'Distance Blocking', BLK51: 'OC Blocking',
  '51PT': 'Phase Backup OC', '50P': 'Phase Instantaneous',
  LT1S: 'Latch 1 Set', LT1R: 'Latch 1 Reset',
  SV1S: 'SV Bit 1 Set', SV1R: 'SV Bit 1 Reset',
  OUT101: 'Trip Output', OUT102: 'Close Output', ALARM: 'Alarm',
};

import type { RelayModel } from '../common/types';

export const SEL351_MODEL: RelayModel = {
  id: 'SEL-351',
  label: 'SEL-351 Overcurrent Relay',
  description: 'SEL-351 Series Overcurrent Protection relay with directional elements',
  supportedSections: ['MAIN', 'SET1', 'SET2', 'SET3', 'SET4', 'SELOGIC', 'PORT', 'LDP', 'TAR'],
};

// Known SEL-351 SELOGIC labels with descriptions
export const SEL351_LOGIC_LABELS: Record<string, string> = {
  TR: 'Trip',
  CL: 'Close',
  M1: 'Latching Bit 1',
  M2: 'Latching Bit 2',
  M3: 'Latching Bit 3',
  M4: 'Latching Bit 4',
  '51P1TC': 'Phase Overcurrent (51P1) Timer Control',
  '51P1T':  'Phase Overcurrent (51P1) Trip',
  '51G1TC': 'Ground Overcurrent (51G1) Timer Control',
  '51G1T':  'Ground Overcurrent (51G1) Trip',
  '50P1':   'Phase Instantaneous Overcurrent 1',
  '50G1':   'Ground Instantaneous Overcurrent 1',
  '67P1':   'Phase Directional OC 1',
  '67G1':   'Ground Directional OC 1',
  OUT101:   'Output Contact 101',
  OUT102:   'Output Contact 102',
  OUT103:   'Output Contact 103',
  OUT104:   'Output Contact 104',
  LT1S:     'Latch 1 Set',
  LT1R:     'Latch 1 Reset',
  LT2S:     'Latch 2 Set',
  LT2R:     'Latch 2 Reset',
  TRIP:     'Trip',
  CLOSE:    'Close',
  ALARM:    'Alarm',
};

import type { RelayModel } from '../common/types';

export const SEL487B_MODEL: RelayModel = {
  id: 'SEL-487B',
  label: 'SEL-487B Bus Differential Relay',
  description: '87B bus differential + 50BF breaker failure + check zone protection',
  supportedSections: ['MAIN', 'G', '1', '2', 'L1', 'L2', '87B', 'BF', 'CZ', 'P87', 'SELOGIC'],
};

export const SEL487B_LOGIC_LABELS: Record<string, string> = {
  TR:      'Trip',
  CL:      'Close',
  TRIP:    'Trip',
  CLOSE:   'Close',
  ALARM:   'Alarm',
  HARMS:   'Harmonic Restraint',

  // 87B bus differential elements
  '87B':   'Bus Differential',
  '87B1':  'Zone 1 Bus Differential',
  '87B2':  'Zone 2 Bus Differential',
  '87BP':  'Phase Bus Differential',
  '87BQ':  'Neg-Seq Bus Differential',
  '87BT':  'Bus Differential Trip',
  '87B1T': 'Zone 1 Bus Diff Trip',
  '87B2T': 'Zone 2 Bus Diff Trip',
  '87BTC': 'Bus Diff Timer Control',

  // Check zone
  'CZ87B':  'Check Zone Bus Differential',
  'CZ87BP': 'Check Zone Phase Diff',

  // Breaker failure
  '50BF':   'Breaker Failure',
  '50BF1':  'Breaker Failure Zone 1',
  '50BF2':  'Breaker Failure Zone 2',
  '50BFT':  'Breaker Failure Trip',
  '50BFTC': 'Breaker Failure Timer Control',

  // Overcurrent backup
  '51P1TC': 'Phase OC Timer Control',
  '51P1T':  'Phase OC Trip',
  '51G1TC': 'Ground OC Timer Control',
  '51G1T':  'Ground OC Trip',
  '50P1':   'Phase Instantaneous OC',
  '50G1':   'Ground Instantaneous OC',

  // Outputs and latches
  OUT101: 'Output Contact 101',
  OUT102: 'Output Contact 102',
  OUT103: 'Output Contact 103',
  OUT104: 'Output Contact 104',
  LT1S:   'Latch 1 Set',
  LT1R:   'Latch 1 Reset',
  LT2S:   'Latch 2 Set',
  LT2R:   'Latch 2 Reset',
  M1:     'Latch Bit 1',
  M2:     'Latch Bit 2',
  M3:     'Latch Bit 3',
  M4:     'Latch Bit 4',
};

import type { RelayModel } from '../common/types';

export const SEL787_MODEL: RelayModel = {
  id: 'SEL-787',
  label: 'SEL-787 Transformer Differential Relay',
  description: '87T transformer differential + 51N + REF protection',
  supportedSections: ['MAIN','SET1','SELOGIC','PORT','TAR'],
};

export const SEL787_LOGIC_LABELS: Record<string, string> = {
  TR: 'Trip',
  '87T': 'Transformer Differential', '87TP': 'Diff Phase', '87TQ': 'Negative Sequence Diff',
  '51N': 'Neutral OC', '51NT': 'Neutral OC Trip',
  REF: 'Restricted Earth Fault',
  HARMS: 'Harmonic Restraint',
  LT1S: 'Latch 1 Set', LT1R: 'Latch 1 Reset',
  OUT101: 'Trip', ALARM: 'Alarm',
};

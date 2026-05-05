import type { RelayModel } from '../common/types';

export const SEL751_MODEL: RelayModel = {
  id: 'SEL-751',
  label: 'SEL-751 Feeder Protection Relay',
  description: 'Advanced feeder relay with 50/51/67 + SEF + arc-flash + cold load',
  supportedSections: ['MAIN','SET1','SET2','SELOGIC','PORT','TAR'],
};

export const SEL751_LOGIC_LABELS: Record<string, string> = {
  TR: 'Trip', CL: 'Close',
  '51PT': 'Phase OC Trip', '51GT': 'Ground OC Trip', '51NT': 'Neutral OC Trip',
  '67PT': 'Phase Dir. OC Trip', '67GT': 'Ground Dir. OC Trip',
  '50P1': 'Phase Inst. 1', '50G1': 'Ground Inst. 1', '50N': 'Neutral Inst.',
  SEF: 'Sensitive Earth Fault',
  CLDI: 'Cold Load Inhibit',
  AFD: 'Arc-Flash Detection',
  LT1S: 'Latch 1 Set', LT1R: 'Latch 1 Reset',
  SV1S: 'SV 1 Set', SV1R: 'SV 1 Reset',
  OUT101: 'Trip', OUT102: 'Close', ALARM: 'Alarm',
};

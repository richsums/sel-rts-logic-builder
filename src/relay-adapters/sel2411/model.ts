import type { RelayModel } from '../common/types';

export const SEL2411_MODEL: RelayModel = {
  id: 'SEL-2411',
  label: 'SEL-2411 Programmable Automation Controller',
  description: 'PAC with custom SELogic interlocking and automation schemes',
  supportedSections: ['MAIN','SELOGIC CONTROL EQUATIONS','DIGITAL OUTPUTS','ANALOG'],
};

export const SEL2411_LOGIC_LABELS: Record<string, string> = {
  OUT1: 'Digital Output 1', OUT2: 'Digital Output 2',
  OUT3: 'Digital Output 3', OUT4: 'Digital Output 4',
  SV1S: 'SV Bit 1 Set', SV1R: 'SV Bit 1 Reset',
  SV2S: 'SV Bit 2 Set', SV2R: 'SV Bit 2 Reset',
  LT1S: 'Latch 1 Set', LT1R: 'Latch 1 Reset',
  ALARM: 'Alarm', TRIP: 'Trip Command',
};

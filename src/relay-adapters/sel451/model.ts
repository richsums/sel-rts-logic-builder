import type { RelayModel } from '../common/types';
export const SEL451_MODEL: RelayModel = {
  id: 'SEL-451',
  label: 'SEL-451 Distance Protection Relay',
  description: 'SEL-451 Line Protection relay with distance and pilot elements',
  supportedSections: ['MAIN','SET1','SET2','SET3','SELOGIC','PORT','ALIAS'],
};
export const SEL451_LOGIC_LABELS: Record<string,string> = {
  TR:'Trip', CL:'Close', '21P1T':'Zone 1 Phase Trip','21P2T':'Zone 2 Phase Trip',
  Z1G:'Zone 1 Ground','Z2G':'Zone 2 Ground','POTT':'POTT Trip','PUTT':'PUTT Trip',
  OUT101:'Output 101', ALARM:'Alarm',
};

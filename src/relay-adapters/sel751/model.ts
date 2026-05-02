import type { RelayModel } from '../common/types';
export const SEL751_MODEL: RelayModel = {
  id: 'SEL-751',
  label: 'SEL-751 Feeder Protection Relay',
  description: 'SEL-751 Feeder Protection relay with arc-flash detection',
  supportedSections: ['MAIN','SET1','SET2','SELOGIC','PORT','TAR'],
};
export const SEL751_LOGIC_LABELS: Record<string,string> = {
  TR:'Trip', CL:'Close', M1:'Latching Bit 1', M2:'Latching Bit 2',
  '51P1T':'Phase OC Trip','51G1T':'Ground OC Trip','49T':'Thermal Trip',
  OUT101:'Output 101', OUT102:'Output 102', ALARM:'Alarm',
};

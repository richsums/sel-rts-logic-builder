import type { RelayModelId } from '../relay-adapters/common/types';

export interface RelayTemplate {
  model: RelayModelId;
  initBlock: string;
  signalPrefix: string;
  checkCommand: string;
}

export const RELAY_TEMPLATES: Record<string, RelayTemplate> = {
  'SEL-351': {
    model: 'SEL-351',
    initBlock: '* SEL-351 OC Relay Test\nINIT',
    signalPrefix: '',
    checkCommand: 'CHECK',
  },
  'SEL-751': {
    model: 'SEL-751',
    initBlock: '* SEL-751 Feeder Relay Test\nINIT',
    signalPrefix: '',
    checkCommand: 'CHECK',
  },
  'SEL-451': {
    model: 'SEL-451',
    initBlock: '* SEL-451 Distance Relay Test\nINIT',
    signalPrefix: '',
    checkCommand: 'CHECK',
  },
};

export function getTemplate(model: RelayModelId): RelayTemplate {
  return RELAY_TEMPLATES[model] ?? RELAY_TEMPLATES['SEL-351'];
}

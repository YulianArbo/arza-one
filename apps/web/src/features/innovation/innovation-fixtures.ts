import type { Idea, IpAssetDetail, RoadmapItem } from '@arza/contracts';

import { SESSION } from '../../test-support/fake-api';

// Datos ficticios de las pruebas de Innovación (B40).

export const INN_ID = (n: number): string =>
  `01999a00-0000-7000-8000-0000000b40${String(n).padStart(2, '0')}`;

export const ME = { id: SESSION.user.id, name: 'Ana Pérez' };
export const OTHER = { id: INN_ID(1), name: 'Luis Colaborador' };

export const IDEA: Idea = {
  id: INN_ID(10),
  code: 'IDE-2026-0001',
  title: 'Conciliación bancaria asistida',
  description: 'Conciliar los extractos con los pagos.',
  expected_benefit: null,
  stage: 'registered',
  proposer: OTHER,
  proposed_on: '2026-11-20',
  evaluator: null,
  viability: null,
  decision_note: null,
  decided_by: null,
  decided_on: null,
  version: 1,
};

export const EVALUATED: Idea = {
  ...IDEA,
  id: INN_ID(11),
  code: 'IDE-2026-0002',
  stage: 'evaluating',
  evaluator: ME,
  viability: {
    scores: { market: 4, technical: 4, strategic: 5, cost_benefit: 3, risk: 4 },
    total: 20,
    concept: 'viable',
    observations: null,
    evaluated_by: ME,
    evaluated_on: '2026-11-21',
    record_code: 'FT-INN-003-2026-0001',
  },
  version: 3,
};

export const OWN_IDEA: Idea = { ...IDEA, id: INN_ID(12), code: 'IDE-2026-0003', proposer: ME };

export const ITEM: RoadmapItem = {
  id: INN_ID(20),
  product: 'ARZA ONE',
  title: 'Portal de clientes',
  description: null,
  quarter: '2027-T1',
  status: 'in_progress',
  owner: OTHER,
  idea: null,
  version_label: null,
  released_on: null,
  ip_asset: null,
  version: 2,
};

export const ASSET: IpAssetDetail = {
  id: INN_ID(30),
  code: 'PI-2026-0001',
  kind: 'trademark',
  title: 'ARZA ONE',
  holder: 'Empresa de prueba S.A.S.',
  registry_number: 'SD-1234',
  nice_classes: '9, 42',
  office: 'Superintendencia de Industria y Comercio',
  filed_on: '2017-05-10',
  granted_on: '2017-09-10',
  expires_on: '2027-05-10',
  status: 'registered',
  responsible: ME,
  product: null,
  version_label: null,
  certificate: null,
  notes: null,
  renewal_due: true,
  days_to_expiry: 170,
  authors_count: 0,
  chain_complete: false,
  version: 4,
  authors: [],
};

export const SOFTWARE: IpAssetDetail = {
  ...ASSET,
  id: INN_ID(31),
  code: 'PI-2026-0002',
  kind: 'software',
  title: 'ARZA ONE 2.0',
  nice_classes: null,
  office: 'Dirección Nacional de Derecho de Autor',
  expires_on: null,
  status: 'proposed',
  renewal_due: false,
  days_to_expiry: null,
  version: 1,
  authors: [
    {
      id: INN_ID(40),
      name: 'Autora externa',
      user_id: null,
      contribution: null,
      support_kind: 'document',
      support_label: 'cesion.pdf',
    },
  ],
  authors_count: 1,
  chain_complete: true,
};

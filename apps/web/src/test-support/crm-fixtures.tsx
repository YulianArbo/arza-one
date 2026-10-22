// Datos ficticios de las pruebas de las pantallas del CRM (B22). Ninguno es real.

import type { PermissionCode } from '@arza/contracts';

import { SESSION, json, mockApi, type SentRequest } from './fake-api';
import { AUTHORIZATION_NOTICE, ORG_ID, PERSON_ID, catalog, permissionsOf } from './party-fixtures';

export const LEAD_ID = '01999a00-0000-7000-8000-0000000c0001';
export const OPPORTUNITY_ID = '01999a00-0000-7000-8000-0000000c0101';
export const OTHER_OPPORTUNITY_ID = '01999a00-0000-7000-8000-0000000c0102';
export const ACTIVITY_ID = '01999a00-0000-7000-8000-0000000c0201';
export const CAMPAIGN_ID = '01999a00-0000-7000-8000-0000000c0301';
const OWNER = { id: '01999a00-0000-7000-8000-00000000a001', name: 'Ana Pérez' };

const ALL_CRM: readonly PermissionCode[] = [
  'party.read',
  'crm.lead.read',
  'crm.lead.create',
  'crm.lead.update',
  'crm.lead.convert',
  'crm.opportunity.read',
  'crm.opportunity.create',
  'crm.opportunity.update',
  'crm.opportunity.close',
  'crm.report.read',
];

export const COMMERCIAL = permissionsOf(ALL_CRM);
export const CRM_READER = permissionsOf([
  'crm.lead.read',
  'crm.opportunity.read',
  'crm.report.read',
]);

const leadSummary = {
  id: LEAD_ID,
  code: 'LEA-2026-0001',
  status: 'new',
  person: { id: PERSON_ID, name: 'Laura Gómez Ríos' },
  email: 'laura@andina.example',
  phone: null,
  company_name: 'Andina S.A.S.',
  source: { code: 'WEBSITE', label: 'Sitio web' },
  campaign: null,
  owner: OWNER,
  created_at: '2026-10-20T15:00:00.000Z',
  version: 2,
} as const;

export function leadDetail(overrides: object = {}): object {
  return {
    ...leadSummary,
    need: 'Necesita un portal de autogestión para sus clientes.',
    consent: {
      id: '01999a00-0000-7000-8000-0000000c0401',
      granted_on: '2026-10-20',
      purposes: ['COMMERCIAL'],
    },
    discard_reason: null,
    discard_note: null,
    opportunity: null,
    qualified_at: null,
    closed_at: null,
    ...overrides,
  };
}

export function opportunity(overrides: object = {}): object {
  return {
    id: OPPORTUNITY_ID,
    code: 'OPO-2026-0001',
    title: 'Portal de clientes',
    party: { id: ORG_ID, name: 'Comercializadora Andina S.A.S.' },
    stage: 'prospecting',
    estimated_value: '25000000.00',
    probability: 10,
    weighted_value: '2500000.00',
    expected_close: '2026-12-15',
    owner: OWNER,
    lost_reason: null,
    closed_at: null,
    version: 3,
    ...overrides,
  };
}

export function opportunityDetail(overrides: object = {}): object {
  return {
    ...opportunity(),
    lead: { id: LEAD_ID, code: 'LEA-2026-0001' },
    lost_note: null,
    created_at: '2026-10-21T15:00:00.000Z',
    ...overrides,
  };
}

export const ACTIVITY = {
  id: ACTIVITY_ID,
  type: 'call',
  subject: 'Llamar para entender la necesidad',
  notes: null,
  due_at: '2026-10-23T15:00:00.000Z',
  done_at: null,
  outcome: null,
  assignee: OWNER,
  record: { kind: 'lead', id: LEAD_ID, code: 'LEA-2026-0001', label: 'Laura Gómez Ríos' },
  version: 1,
} as const;

export const CAMPAIGN = {
  id: CAMPAIGN_ID,
  name: 'Feria tecnológica',
  channel: 'event',
  starts_on: '2026-10-01',
  ends_on: null,
  budget: '1500000.00',
  leads_count: 4,
  version: 1,
} as const;

export const FUNNEL = {
  generated_at: '2026-10-22T15:00:00.000Z',
  stages: [
    {
      stage: 'prospecting',
      label: 'Prospección',
      count: 1,
      value: '25000000.00',
      weighted_value: '2500000.00',
    },
    { stage: 'diagnosis', label: 'Diagnóstico', count: 0, value: '0.00', weighted_value: '0.00' },
    { stage: 'proposal', label: 'Propuesta', count: 0, value: '0.00', weighted_value: '0.00' },
    { stage: 'negotiation', label: 'Negociación', count: 0, value: '0.00', weighted_value: '0.00' },
    { stage: 'won', label: 'Ganada', count: 0, value: '0.00', weighted_value: '0.00' },
    { stage: 'lost', label: 'Perdida', count: 1, value: '300000.10', weighted_value: '0.00' },
  ],
  totals: {
    open_count: 1,
    open_value: '25000000.00',
    weighted_value: '2500000.00',
    won_count: 0,
    won_value: '0.00',
    lost_count: 1,
    lost_value: '300000.10',
    win_rate: 0,
    leads_count: 4,
    converted_leads: 1,
    lead_conversion_rate: 25,
  },
  lost_reasons: [{ code: 'PRICE', label: 'Precio', count: 1, value: '300000.10' }],
  rows: [
    {
      code: 'OPO-2026-0001',
      created_on: '2026-10-21',
      client: 'Comercializadora Andina S.A.S.',
      title: 'Portal de clientes',
      stage: 'prospecting',
      estimated_value: '25000000.00',
      probability: 10,
      weighted_value: '2500000.00',
      expected_close: '2026-12-15',
      owner: 'Ana Pérez',
      status: 'open',
      lost_reason: null,
      closed_on: null,
    },
  ],
};

type Routes = Record<string, (r: SentRequest) => Response>;

/** API simulada del CRM con la sesión de Ana y los permisos dados. */
const OPPORTUNITIES = {
  data: [
    opportunity(),
    opportunity({
      id: OTHER_OPPORTUNITY_ID,
      code: 'OPO-2026-0002',
      title: 'Mesa de ayuda',
      stage: 'negotiation',
      probability: 75,
      expected_close: '2026-01-10',
    }),
  ],
  next_cursor: null,
};

const CATALOG_ROUTES: Routes = {
  'GET /v1/catalogs/crm_lead_sources': () =>
    json(
      catalog('crm_lead_sources', [
        ['WEBSITE', 'Sitio web'],
        ['EVENT', 'Evento o feria'],
      ]),
    ),
  'GET /v1/catalogs/crm_lost_reasons': () =>
    json(catalog('crm_lost_reasons', [['PRICE', 'Precio']])),
  'GET /v1/catalogs/crm_discard_reasons': () =>
    json(catalog('crm_discard_reasons', [['NOT_TARGET', 'No es cliente objetivo']])),
  'GET /v1/catalogs/personal_data_purposes': () =>
    json(catalog('personal_data_purposes', [['COMMERCIAL', 'Relación comercial']])),
};

export function serveCrm(permissions: object, extra: Routes = {}): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/crm/leads': () => json({ data: [leadSummary], next_cursor: null }),
    [`GET /v1/crm/leads/${LEAD_ID}`]: () => json(leadDetail()),
    'GET /v1/crm/leads/authorization-notices': () => json({ data: [AUTHORIZATION_NOTICE] }),
    'GET /v1/crm/opportunities': () => json(OPPORTUNITIES),
    [`GET /v1/crm/opportunities/${OPPORTUNITY_ID}`]: () => json(opportunityDetail()),
    'GET /v1/crm/activities': () => json({ data: [ACTIVITY], next_cursor: null }),
    'GET /v1/crm/campaigns': () => json({ data: [CAMPAIGN] }),
    'GET /v1/crm/reports/funnel': () => json(FUNNEL),
    ...CATALOG_ROUTES,
    'GET /v1/parties': () => json({ data: [], next_cursor: null }),
    'GET /v1/parties/search': () => json({ data: [] }),
    'GET /v1/files': () => json({ data: [] }),
    ...extra,
  });
}

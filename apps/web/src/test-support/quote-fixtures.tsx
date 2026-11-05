// Datos ficticios de las pruebas de las pantallas de cotizaciones y portafolio (B23). Ninguno es real.

import type { PermissionCode } from '@arza/contracts';

import { OPPORTUNITY_ID, opportunityDetail, serveCrm } from './crm-fixtures';
import { json, type SentRequest } from './fake-api';
import { ORG_ID, permissionsOf } from './party-fixtures';

export const QUOTE_ID = '01999a00-0000-7000-8000-0000000c0501';
export const OLD_QUOTE_ID = '01999a00-0000-7000-8000-0000000c0500';
export const SERVICE_ID = '01999a00-0000-7000-8000-0000000c0601';
const AUTHOR = { id: '01999a00-0000-7000-8000-00000000a001', name: 'Ana Pérez' };
const DIRECTOR = { id: '01999a00-0000-7000-8000-00000000a002', name: 'Diego Director' };

const QUOTING: readonly PermissionCode[] = [
  'party.read',
  'crm.lead.read',
  'crm.opportunity.read',
  'crm.opportunity.update',
  'crm.service.manage',
  'crm.quote.read',
  'crm.quote.create',
  'crm.quote.update',
  'crm.quote.send',
];

export const QUOTER = permissionsOf(QUOTING);
export const DIRECTION = permissionsOf([
  'crm.lead.read',
  'crm.opportunity.read',
  'crm.quote.read',
  'crm.quote.approve',
]);
export const QUOTE_READER = permissionsOf(['crm.opportunity.read', 'crm.quote.read']);

const SERVICE = {
  id: SERVICE_ID,
  code: 'SRV-0001',
  name: 'Desarrollo a la medida',
  description: 'Horas del equipo de desarrollo',
  unit: 'hour',
  base_price: '85000.00',
  tax_key: 'IVA_GENERAL',
  tax_label: 'IVA general',
  is_active: true,
  version: 1,
} as const;

export const OPTIONS = {
  services: [SERVICE],
  taxes: [
    { key: 'IVA_GENERAL', label: 'IVA general', rate: '19.00' },
    { key: 'IVA_EXENTO', label: 'Sin IVA (exento o excluido)', rate: '0.00' },
  ],
  discount_cap: '10.00',
  default_valid_days: 30,
} as const;

const ITEM = {
  id: '01999a00-0000-7000-8000-0000000c0701',
  position: 1,
  service: { id: SERVICE_ID, code: 'SRV-0001' },
  description: 'Desarrollo a la medida',
  unit: 'hour',
  quantity: '10.00',
  unit_price: '85000.00',
  discount_percent: '5.00',
  tax_key: 'IVA_GENERAL',
  tax_rate: '19.00',
  line_subtotal: '850000.00',
  line_discount: '42500.00',
  line_tax: '153425.00',
  line_total: '960925.00',
} as const;

const SUMMARY = {
  id: QUOTE_ID,
  code: 'COT-2026-0001',
  version_number: 2,
  opportunity: { id: OPPORTUNITY_ID, code: 'OPO-2026-0001', title: 'Portal de clientes' },
  party: { id: ORG_ID, name: 'Comercializadora Andina S.A.S.' },
  status: 'draft',
  valid_until: '2026-11-30',
  total: '960925.00',
  author: AUTHOR,
  sent_at: null,
  created_at: '2026-10-28T15:00:00.000Z',
  version: 4,
} as const;

function quoteSummary(overrides: object = {}): object {
  return { ...SUMMARY, ...overrides };
}

const CONDITIONS = {
  payment_terms: '50 % al iniciar y 50 % a la entrega',
  delivery_terms: 'Treinta días calendario',
  warranty: null,
} as const;

const NO_APPROVAL = {
  required: false,
  largest_discount: '5.00',
  discount_cap: null,
  decided_by: null,
  decided_at: null,
  note: null,
} as const;

const VERSIONS = [
  {
    id: QUOTE_ID,
    version_number: 2,
    status: 'draft',
    total: '960925.00',
    created_at: '2026-10-28T15:00:00.000Z',
  },
  {
    id: OLD_QUOTE_ID,
    version_number: 1,
    status: 'superseded',
    total: '1011500.00',
    created_at: '2026-10-27T15:00:00.000Z',
  },
] as const;

export function quoteDetail(overrides: object = {}): object {
  return {
    ...SUMMARY,
    conditions: CONDITIONS,
    notes: null,
    items: [ITEM],
    subtotal: '850000.00',
    discount_total: '42500.00',
    tax_total: '153425.00',
    taxes: [{ tax_rate: '19.00', base: '807500.00', tax: '153425.00' }],
    approval: NO_APPROVAL,
    recipient: null,
    email_sent_at: null,
    response: null,
    pdf: { status: 'none', file_name: null },
    party_email: 'compras@andina.example',
    versions: VERSIONS,
    ...overrides,
  };
}

export { DIRECTOR };

type Routes = Record<string, (r: SentRequest) => Response>;

/** API simulada del CRM con las cotizaciones, el portafolio y las opciones del asistente. */
export function serveQuotes(permissions: object, extra: Routes = {}): SentRequest[] {
  return serveCrm(permissions, {
    'GET /v1/crm/quotes': () => json({ data: [quoteSummary()], next_cursor: null }),
    [`GET /v1/crm/quotes/${QUOTE_ID}`]: () => json(quoteDetail()),
    'GET /v1/crm/quotes/options': () => json(OPTIONS),
    'GET /v1/crm/services': () => json({ data: [SERVICE] }),
    [`GET /v1/crm/opportunities/${OPPORTUNITY_ID}`]: () => json(opportunityDetail()),
    ...extra,
  });
}

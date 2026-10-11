// Datos ficticios de las pruebas de las pantallas de terceros (B13). Ninguno es real.

import { partyDetailSchema, type PartyDetail, type PermissionCode } from '@arza/contracts';

import { SESSION, json, mockApi, type SentRequest } from './fake-api';

export const ORG_ID = '01999a00-0000-7000-8000-00000000f001';
export const PERSON_ID = '01999a00-0000-7000-8000-00000000f002';
export const DUPLICATE_ID = '01999a00-0000-7000-8000-00000000f003';
const CONTACT_ID = '01999a00-0000-7000-8000-00000000f101';
export const ACCOUNT_ID = '01999a00-0000-7000-8000-00000000f201';
const OWN_ACCOUNT_ID = '01999a00-0000-7000-8000-00000000f202';
export const REVIEW_ID = '01999a00-0000-7000-8000-00000000f301';
const OTHER_USER = '01999a00-0000-7000-8000-00000000a099';

export function permissionsOf(codes: readonly PermissionCode[]): object {
  return {
    roles: [{ id: '01999a00-0000-7000-8000-00000000c020', code: 'COMERCIAL', name: 'Comercial' }],
    permissions: codes.map((code) => ({ code, scope: 'all' })),
  };
}

export const SALES = permissionsOf(['party.read', 'party.create', 'party.update', 'party.merge']);

export const FINANCE = permissionsOf([
  'party.read',
  'party.create',
  'party.update',
  'party.merge',
  'party.bank_account.read',
  'party.bank_account.manage',
  'party.bank_account.approve',
  'party.due_diligence.manage',
  'party.due_diligence.approve',
]);

const summary = {
  id: ORG_ID,
  kind: 'organization',
  name: 'Comercializadora Andina S.A.S.',
  id_type: 'NIT',
  id_number: '800197268',
  check_digit: 4,
  email: 'compras@andina.example',
  phone: '+573105550101',
  city: 'Medellín',
  status: 'active',
  roles: ['customer'],
  version: 2,
} as const;

export const ORGANIZATION: PartyDetail = partyDetailSchema.parse({
  ...summary,
  first_name: null,
  last_name: null,
  legal_name: summary.name,
  trade_name: 'Andina',
  address: 'Calle 10 # 20-30',
  status_reason: null,
  data_purpose: null,
  data_authorization: null,
  data_authorized_on: null,
  role_history: [
    { role: 'customer', since: '2026-01-15', is_active: true },
    { role: 'supplier', since: '2025-03-01', is_active: false },
  ],
  due_diligence: { state: 'approved', next_review_on: '2027-01-15' },
  created_at: '2026-01-15T14:00:00.000Z',
});

export const PERSON_SUMMARY = {
  ...summary,
  id: PERSON_ID,
  kind: 'person',
  name: 'Laura Gómez Ríos',
  id_type: 'CC',
  id_number: '1020555001',
  check_digit: null,
  roles: [],
};

export const DUPLICATE_SUMMARY = {
  ...summary,
  id: DUPLICATE_ID,
  name: 'COMERCIALIZADORA ANDINA SAS',
  id_number: '900555102',
  check_digit: 3,
};

const PARTY_LIST = { data: [summary, PERSON_SUMMARY], next_cursor: null };

export const CONTACTS = {
  data: [
    {
      id: CONTACT_ID,
      organization: { id: ORG_ID, name: summary.name },
      person: {
        id: PERSON_ID,
        name: 'Laura Gómez Ríos',
        email: 'laura@andina.example',
        phone: null,
      },
      job_title: 'Gerente de compras',
      is_primary: true,
      can_sign: true,
      version: 1,
    },
  ],
};

const reviewBase = {
  requested_by: { id: OTHER_USER, display_name: 'Luis Mora' },
  requested_at: '2026-10-01T15:00:00.000Z',
  reviewed_by: null,
  reviewed_at: null,
  review_note: null,
};

export const ACCOUNTS = {
  data: [
    {
      id: ACCOUNT_ID,
      bank: 'BANCOLOMBIA',
      account_type: 'savings',
      number_masked: '•••• 6789',
      status: 'pending',
      replaces_id: null,
      ...reviewBase,
    },
    {
      id: OWN_ACCOUNT_ID,
      bank: 'DAVIVIENDA',
      account_type: 'checking',
      number_masked: '•••• 4321',
      status: 'pending',
      replaces_id: null,
      ...reviewBase,
      requested_by: { id: SESSION.user.id, display_name: 'Ana Pérez' },
    },
  ],
};

export const REVIEWS = {
  data: [
    {
      id: REVIEW_ID,
      risk_level: 'medium',
      summary: 'Revisión de RUT y listas.',
      status: 'pending',
      next_review_on: null,
      ...reviewBase,
    },
  ],
};

export const TIMELINE = {
  data: [
    {
      id: '01999a00-0000-7000-8000-00000000f401',
      occurred_at: '2026-10-02T15:00:00.000Z',
      actor_name: 'Luis Mora',
      action: 'party.merge',
      entity_type: 'party',
      changes: {},
    },
  ],
  next_cursor: null,
};

const catalog = (key: string, items: readonly (readonly [string, string])[]) => ({
  key,
  name: key,
  description: null,
  item_count: items.length,
  items: items.map(([code, label], index) => ({
    id: `01999a00-0000-7000-8000-${String(key.length).padStart(4, '0')}${String(index).padStart(8, '0')}`,
    code,
    label,
    sort_order: index,
    is_active: true,
    version: 1,
  })),
});

const CATALOGS = {
  identification_types: catalog('identification_types', [
    ['NIT', 'NIT'],
    ['CC', 'Cédula de ciudadanía'],
  ]),
  personal_data_purposes: catalog('personal_data_purposes', [['COMMERCIAL', 'Relación comercial']]),
  banks: catalog('banks', [
    ['BANCOLOMBIA', 'Bancolombia'],
    ['DAVIVIENDA', 'Davivienda'],
  ]),
};

type Routes = Record<string, (r: SentRequest) => Response>;

/** API simulada de terceros con la sesión de Ana y los permisos dados. */
export function serveParties(permissions: object, extra: Routes = {}): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/parties': () => json(PARTY_LIST),
    'GET /v1/parties/search': () => json({ data: [] }),
    [`GET /v1/parties/${ORG_ID}`]: () => json(ORGANIZATION),
    [`GET /v1/parties/${ORG_ID}/contacts`]: () => json(CONTACTS),
    [`GET /v1/parties/${ORG_ID}/bank-accounts`]: () => json(ACCOUNTS),
    [`GET /v1/parties/${ORG_ID}/due-diligence`]: () => json(REVIEWS),
    [`GET /v1/parties/${ORG_ID}/timeline`]: () => json(TIMELINE),
    'GET /v1/catalogs/identification_types': () => json(CATALOGS.identification_types),
    'GET /v1/catalogs/personal_data_purposes': () => json(CATALOGS.personal_data_purposes),
    'GET /v1/catalogs/banks': () => json(CATALOGS.banks),
    ...extra,
  });
}

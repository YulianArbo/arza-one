// Datos ficticios de las pruebas de las pantallas de privacidad (B17). Ninguno es real.

import type { PermissionCode } from '@arza/contracts';
import type { JSX, ReactNode } from 'react';

import { RequireSession } from '../features/session/session-provider';
import { SESSION, json, mockApi, type SentRequest } from './fake-api';
import { catalog } from './party-fixtures';

const PUBLISHED_ID = '01999a00-0000-7000-8000-00000000d001';
export const DRAFT_ID = '01999a00-0000-7000-8000-00000000d002';
export const CONSENT_ID = '01999a00-0000-7000-8000-00000000d101';
export const ACTIVITY_ID = '01999a00-0000-7000-8000-00000000d201';
const PROCESSOR_ID = '01999a00-0000-7000-8000-00000000d301';
export const ORG_ID = '01999a00-0000-7000-8000-00000000d401';
const PERSON_ID = '01999a00-0000-7000-8000-00000000d402';

const BODY = 'Texto ficticio de la autorización de clientes para las pruebas de las pantallas.';

export function privacyPermissions(codes: readonly PermissionCode[]): object {
  return {
    roles: [{ id: '01999a00-0000-7000-8000-00000000c030', code: 'OFICIAL_DATOS', name: 'Oficial' }],
    permissions: codes.map((code) => ({ code, scope: 'all' })),
  };
}

export const OFFICER = privacyPermissions([
  'privacy.notice.manage',
  'privacy.consent.read',
  'privacy.activity.manage',
  'privacy.processor.manage',
  'privacy.request.manage',
  'party.read',
]);

export function notice(overrides: object = {}): Record<string, unknown> {
  return {
    id: PUBLISHED_ID,
    key: 'authorization_customer',
    label: 'Autorización de clientes',
    version_number: 1,
    title: 'Autorización de clientes 2026',
    body: BODY,
    purposes: ['COMMERCIAL'],
    status: 'published',
    effective_from: '2026-10-01T13:00:00.000Z',
    created_at: '2026-09-30T13:00:00.000Z',
    version: 2,
    ...overrides,
  };
}

const NOTICES = {
  data: [
    notice({ id: DRAFT_ID, version_number: 2, status: 'draft', effective_from: null, version: 1 }),
    notice({}),
  ],
};

export function consent(overrides: object = {}): Record<string, unknown> {
  return {
    id: CONSENT_ID,
    party: { id: PERSON_ID, name: 'Laura Gómez Ríos' },
    notice: {
      id: PUBLISHED_ID,
      key: 'authorization_customer',
      label: 'Autorización de clientes',
      version_number: 1,
      title: 'Autorización de clientes 2026',
    },
    purposes: ['COMMERCIAL'],
    channel: 'written',
    granted_on: '2026-10-01',
    status: 'active',
    revoked_at: null,
    source: 'party_create',
    evidence: {
      recorded_by: 'Ana Pérez',
      recorded_at: '2026-10-01T15:00:00.000Z',
      ip_address: '203.0.113.7',
      user_agent: 'Navegador de prueba',
      file_id: null,
    },
    revocation_reason: null,
    ...overrides,
  };
}

export const ACTIVITIES = {
  data: [
    {
      id: ACTIVITY_ID,
      name: 'Gestión de clientes',
      purpose: 'Atender la relación comercial con los clientes',
      data_categories: ['identification', 'health'],
      holder_types: ['customers'],
      legal_basis: 'Autorización del titular',
      retention: 'Diez años',
      international_transfers: null,
      processors: [],
      sensitive: true,
      status: 'active',
      version: 3,
    },
  ],
};

export const PROCESSORS = {
  data: [
    {
      id: PROCESSOR_ID,
      party: { id: ORG_ID, name: 'Nube Andina S.A.S.' },
      service: 'Alojamiento en la nube',
      country: 'US',
      contract_file_id: null,
      has_contract: false,
      review_on: '2027-01-31',
      status: 'active',
      version: 1,
    },
  ],
};

const PARTIES = {
  data: [
    {
      id: ORG_ID,
      kind: 'organization',
      name: 'Nube Andina S.A.S.',
      id_type: 'NIT',
      id_number: '900555201',
      check_digit: 7,
      email: null,
      phone: null,
      city: null,
      status: 'active',
      roles: ['supplier'],
      version: 1,
    },
  ],
  next_cursor: null,
};

const PURPOSES = catalog('personal_data_purposes', [['COMMERCIAL', 'Relación comercial']]);

type Routes = Record<string, (request: SentRequest) => Response>;

/** API simulada de privacidad con la sesión de Ana y los permisos dados. */
export function servePrivacy(permissions: object, extra: Routes = {}): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/notices': () => json(NOTICES),
    'GET /v1/consents': () => json({ data: [consent()], next_cursor: null }),
    'GET /v1/processing-activities': () => json(ACTIVITIES),
    'GET /v1/processors': () => json(PROCESSORS),
    'GET /v1/parties': () => json(PARTIES),
    'GET /v1/files': () => json({ data: [] }),
    'GET /v1/catalogs/personal_data_purposes': () => json(PURPOSES),
    ...extra,
  });
}

export function Screen({ children }: { readonly children: ReactNode }): JSX.Element {
  return <RequireSession kind="internal">{children}</RequireSession>;
}

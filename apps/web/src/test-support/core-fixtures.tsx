// Datos ficticios de las pruebas de las pantallas de datos maestros (B12). Ninguno es real.

import type { PermissionCode } from '@arza/contracts';
import type { JSX, ReactNode } from 'react';

import { RequireSession } from '../features/session/session-provider';
import { SESSION, json, mockApi, type SentRequest } from './fake-api';

const SITE_MAIN = '01999a00-0000-7000-8000-00000000e001';
export const SITE_OTHER = '01999a00-0000-7000-8000-00000000e002';
const UNIT_DG = '01999a00-0000-7000-8000-00000000e101';
export const UNIT_TEC = '01999a00-0000-7000-8000-00000000e102';
const POS_DIRECTOR = '01999a00-0000-7000-8000-00000000e201';
export const POS_MANAGER = '01999a00-0000-7000-8000-00000000e202';
export const CENTER_ID = '01999a00-0000-7000-8000-00000000e301';
export const ITEM_CC = '01999a00-0000-7000-8000-00000000e401';
export const SEQUENCE_ID = '01999a00-0000-7000-8000-00000000e501';
export const HOLIDAY_ID = '01999a00-0000-7000-8000-00000000e601';

function permissionsOf(codes: readonly PermissionCode[]) {
  return {
    roles: [
      { id: '01999a00-0000-7000-8000-00000000c010', code: 'ADMIN_PLATAFORMA', name: 'Admin' },
    ],
    permissions: codes.map((code) => ({ code, scope: 'all' })),
  };
}

export const CORE_ADMIN = permissionsOf([
  'core.tenant.read',
  'core.tenant.update',
  'core.org.read',
  'core.org.manage',
  'core.catalog.manage',
  'core.parameter.read',
  'core.parameter.manage',
  'core.sequence.manage',
]);

export const CORE_READER = permissionsOf([
  'core.tenant.read',
  'core.org.read',
  'core.parameter.read',
]);

export const TENANT = {
  id: '01999a00-0000-7000-8000-000000000001',
  legal_name: 'Empresa Demo S.A.S.',
  trade_name: 'Demo',
  tax_id: '900123456-7',
  version: 3,
};

export const SITES = {
  data: [
    {
      id: SITE_MAIN,
      name: 'Sede norte',
      city: 'Bogotá',
      address: 'Calle 100 # 10-20',
      is_main: true,
      is_active: true,
      version: 1,
    },
    {
      id: SITE_OTHER,
      name: 'Bodega',
      city: 'Soacha',
      address: 'Carrera 7 # 30-10',
      is_main: false,
      is_active: true,
      version: 2,
    },
  ],
};

const unit = (id: string, code: string, name: string, owner: string | null) => ({
  id,
  parent_id: null,
  code,
  name,
  kind: 'process',
  owner_position_id: owner,
  is_active: true,
  version: 1,
});

export const UNITS = {
  data: [
    unit(UNIT_DG, 'DG', 'Dirección General', POS_DIRECTOR),
    unit(UNIT_TEC, 'TEC', 'Desarrollo y Tecnología', null),
  ],
};

export const POSITIONS = {
  data: [
    {
      id: POS_DIRECTOR,
      org_unit_id: UNIT_DG,
      name: 'Director General',
      reports_to_id: null,
      is_active: true,
      version: 1,
    },
    {
      id: POS_MANAGER,
      org_unit_id: UNIT_TEC,
      name: 'Gerente de Tecnología',
      reports_to_id: POS_DIRECTOR,
      is_active: false,
      version: 2,
    },
  ],
};

export const COST_CENTERS = {
  data: [
    {
      id: CENTER_ID,
      code: 'CC-010',
      name: 'Operación',
      org_unit_id: UNIT_TEC,
      is_active: true,
      version: 1,
    },
  ],
};

const CATALOGS = {
  data: [
    {
      key: 'identification_types',
      name: 'Tipos de documento de identidad',
      description: 'Documentos.',
      item_count: 1,
    },
    { key: 'payment_terms', name: 'Plazos de pago', description: null, item_count: 0 },
  ],
};

export const CATALOG_DETAIL = {
  ...CATALOGS.data[0],
  items: [
    {
      id: ITEM_CC,
      code: 'CC',
      label: 'Cédula de ciudadanía',
      sort_order: 10,
      is_active: true,
      version: 1,
    },
  ],
};

export const SCHEDULE = {
  days: [1, 2, 3, 4, 5],
  morning: { start: '08:00', end: '12:00' },
  afternoon: { start: '13:00', end: '17:00' },
};

const version = (id: string, from: string, to: string | null, by: string | null) => ({
  id,
  value: SCHEDULE,
  valid_from: from,
  valid_to: to,
  created_at: '2026-10-09T20:15:00Z',
  created_by: by === null ? null : { id: SESSION.user.id, name: by },
});

const CURRENT = version('01999a00-0000-7000-8000-00000000e701', '2026-01-01', null, null);

const PARAMETERS = {
  data: [
    {
      key: 'work.schedule',
      label: 'Horario laboral',
      description: 'Días y horas de la jornada.',
      current: CURRENT,
      scheduled: null,
    },
  ],
};

const HISTORY = {
  key: 'work.schedule',
  label: 'Horario laboral',
  data: [
    CURRENT,
    version('01999a00-0000-7000-8000-00000000e702', '2025-01-01', '2025-12-31', 'Ana Pérez'),
  ],
};

export const SEQUENCES = {
  data: [
    {
      id: SEQUENCE_ID,
      key: 'crm.quote',
      name: 'Cotizaciones',
      prefix: 'COT',
      year: 2026,
      padding: 4,
      next_value: 7,
      next_code: 'COT-2026-0007',
      version: 1,
    },
  ],
};

const HOLIDAYS = {
  data: [{ id: HOLIDAY_ID, date: '2026-07-20', name: 'Día de la Independencia' }],
};

/** API simulada con todos los datos maestros; `extra` agrega o reemplaza rutas. */
export function serveCore(
  permissions: object,
  extra: Record<string, (r: SentRequest) => Response> = {},
): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/tenant': () => json(TENANT),
    'GET /v1/sites': () => json(SITES),
    'GET /v1/org-units': () => json(UNITS),
    'GET /v1/positions': () => json(POSITIONS),
    'GET /v1/cost-centers': () => json(COST_CENTERS),
    'GET /v1/catalogs': () => json(CATALOGS),
    'GET /v1/catalogs/identification_types': () => json(CATALOG_DETAIL),
    'GET /v1/catalogs/payment_terms': () => json({ ...CATALOGS.data[1], items: [] }),
    'GET /v1/parameters': () => json(PARAMETERS),
    'GET /v1/parameters/work.schedule/history': () => json(HISTORY),
    'GET /v1/sequences': () => json(SEQUENCES),
    'GET /v1/holidays': () => json(HOLIDAYS),
    ...extra,
  });
}

export function Screen({ children }: { readonly children: ReactNode }): JSX.Element {
  return <RequireSession kind="internal">{children}</RequireSession>;
}

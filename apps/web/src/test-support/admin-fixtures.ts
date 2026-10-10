// Datos ficticios de las pruebas de las pantallas de administración (B10). Ninguno es real.

import type { PermissionCode } from '@arza/contracts';

import { SESSION } from './fake-api';

export const ME_ID = SESSION.user.id;
export const LUIS_ID = '01999a00-0000-7000-8000-00000000a002';
export const ROLE_COMERCIAL = '01999a00-0000-7000-8000-00000000c001';
export const ROLE_CUSTOM = '01999a00-0000-7000-8000-00000000c002';
const ROLE_CLIENT = '01999a00-0000-7000-8000-00000000c003';
export const ASSIGNMENT_ID = '01999a00-0000-7000-8000-00000000d001';

function grants(codes: readonly PermissionCode[], scope: 'all' | 'own' = 'all') {
  return codes.map((code) => ({ code, scope }));
}

/** Permisos de quien administra la plataforma. */
export const ADMIN_PERMISSIONS = {
  roles: [
    {
      id: '01999a00-0000-7000-8000-00000000c010',
      code: 'ADMIN_PLATAFORMA',
      name: 'Administrador de plataforma',
    },
  ],
  permissions: grants([
    'iam.user.read',
    'iam.user.invite',
    'iam.user.lock',
    'iam.user.reset_mfa',
    'iam.role.read',
    'iam.role.manage',
    'iam.role.assign',
    'iam.session.revoke',
    'iam.delegation.manage',
    'iam.access_review.read',
  ]),
};

/** Permisos de quien dirige: lee usuarios y roles, ve el informe y aprueba facturas. */
export const DIRECTOR_PERMISSIONS = {
  roles: [{ id: '01999a00-0000-7000-8000-00000000c011', code: 'DIRECCION', name: 'Dirección' }],
  permissions: grants([
    'iam.user.read',
    'iam.role.read',
    'iam.access_review.read',
    'finance.invoice.approve',
  ]),
};

/** Un colaborador: solo delega lo propio y aprueba gastos. */
export const WORKER_PERMISSIONS = {
  roles: [{ id: '01999a00-0000-7000-8000-00000000c012', code: 'COLABORADOR', name: 'Colaborador' }],
  permissions: [
    ...grants(['iam.delegation.manage'], 'own'),
    ...grants(['finance.expense.approve']),
  ],
};

export const NO_PERMISSIONS = { roles: [], permissions: [] };

export function summary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: LUIS_ID,
    email: 'luis@demo-uno.test',
    display_name: 'Luis Gómez',
    kind: 'internal',
    status: 'active',
    last_login_at: '2026-10-09T14:00:00.000Z',
    roles: [{ code: 'COMERCIAL', name: 'Comercial', valid_until: null }],
    ...overrides,
  };
}

export function detail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...summary(),
    created_at: '2026-10-01T14:00:00.000Z',
    assignments: [
      {
        id: ASSIGNMENT_ID,
        role: { id: ROLE_COMERCIAL, code: 'COMERCIAL', name: 'Comercial' },
        valid_from: '2026-10-01T14:00:00.000Z',
        valid_until: null,
        assigned_by: { id: ME_ID, email: 'ana@demo-uno.test', display_name: 'Ana Pérez' },
      },
    ],
    security: { second_factor: true, mfa_required: true, active_sessions: 2, locked_until: null },
    ...overrides,
  };
}

export function role(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ROLE_COMERCIAL,
    code: 'COMERCIAL',
    name: 'Comercial',
    description: 'Gerente y analistas comerciales.',
    is_system: true,
    audience: 'internal',
    permission_count: 2,
    assigned_users: 3,
    version: 1,
    ...overrides,
  };
}

export const ROLES = {
  data: [
    role(),
    role({ id: ROLE_CUSTOM, code: 'APOYO', name: 'Apoyo comercial', is_system: false, version: 4 }),
    role({ id: '01999a00-0000-7000-8000-00000000c004', code: 'AUDITOR', name: 'Auditor' }),
    role({
      id: ROLE_CLIENT,
      code: 'CLIENTE_ADMIN',
      name: 'Administrador del cliente',
      audience: 'portal',
    }),
  ],
};

export const CATALOG = {
  groups: [
    {
      key: 'crm',
      label: 'Comercial',
      module: 'M05',
      permissions: [
        { code: 'crm.lead.read', description: 'Ver prospectos', ownable: false },
        { code: 'crm.quote.approve', description: 'Aprobar cotizaciones', ownable: false },
      ],
    },
    {
      key: 'service',
      label: 'Servicio al cliente',
      module: 'M08',
      permissions: [{ code: 'service.ticket.read', description: 'Ver tiquetes', ownable: true }],
    },
    {
      key: 'portal',
      label: 'Portal del cliente',
      module: 'M09',
      permissions: [{ code: 'portal.invoice.read', description: 'Ver facturas', ownable: false }],
    },
  ],
};

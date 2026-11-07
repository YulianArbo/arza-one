// Datos ficticios de las pruebas del portal del cliente (B30).

import type {
  PermissionCode,
  PortalHome,
  PortalProjectDetail,
  PortalSignature,
  PortalTerms,
  PortalTicketDetail,
  PortalUserList,
} from '@arza/contracts';
import type { JSX, ReactNode } from 'react';

import { RequireSession } from '../features/session/session-provider';
import { SESSION, json, mockApi, type SentRequest } from './fake-api';

type Handler = Parameters<typeof mockApi>[0][string];
type Routes = Record<string, Handler>;

export const PROJECT_ID = '01999a00-0000-7000-8000-0000000fa001';
export const ENVELOPE_ID = '01999a00-0000-7000-8000-0000000fa101';
export const CONTRACT_ID = '01999a00-0000-7000-8000-0000000fa201';
export const TICKET_ID = '01999a00-0000-7000-8000-0000000fa301';
export const ARTICLE_ID = '01999a00-0000-7000-8000-0000000fa401';
export const USER_ID = '01999a00-0000-7000-8000-0000000fa501';
export const SHARED_ID = '01999a00-0000-7000-8000-0000000fa601';

const PORTAL_SESSION = {
  ...SESSION,
  user: { ...SESSION.user, email: 'compras@cliente.test', kind: 'portal' },
};

function grantsOf(code: string, codes: readonly PermissionCode[]): object {
  return {
    roles: [{ id: '01999a00-0000-7000-8000-00000000c090', code, name: code }],
    permissions: codes.map((permission) => ({ code: permission, scope: 'all' })),
  };
}

export const CLIENT_ADMIN = grantsOf('CLIENTE_ADMIN', [
  'portal.project.read',
  'portal.deliverable.decide',
  'portal.contract.read',
  'portal.contract.sign',
  'portal.invoice.read',
  'portal.ticket.create',
  'portal.ticket.read',
  'portal.user.manage',
  'portal.personal_data.manage',
]);

export const CLIENT_USER = grantsOf('CLIENTE_USUARIO', [
  'portal.project.read',
  'portal.ticket.read',
  'portal.personal_data.manage',
]);

export const TERMS: PortalTerms = {
  status: 'accepted',
  accepted_at: '2026-11-07T15:00:00.000Z',
  documents: [
    {
      id: '01999a00-0000-7000-8000-0000000fa701',
      key: 'portal_terms',
      title: 'Términos de uso del portal',
      body: 'Texto de prueba de los términos.',
      version_number: 1,
    },
    {
      id: '01999a00-0000-7000-8000-0000000fa702',
      key: 'privacy_policy',
      title: 'Política de tratamiento de datos personales',
      body: 'Texto de prueba de la política.',
      version_number: 2,
    },
  ],
};

export const HOME: PortalHome = {
  company: 'Demo Uno S.A.S.',
  projects: 1,
  next_milestones: [
    {
      project_id: PROJECT_ID,
      project: 'Portal de autogestión',
      name: 'Entrega 1',
      due_on: '2026-12-01',
    },
  ],
  pending: { signatures: 1, approvals: 1, open_tickets: 1, waiting_tickets: 0 },
};

const SUMMARY = {
  id: PROJECT_ID,
  code: 'PRY-2026-0001',
  name: 'Portal de autogestión',
  status: 'in_progress',
  starts_on: '2026-11-01',
  ends_on: '2027-03-01',
  progress_pct: 40,
  next_milestone: {
    id: '01999a00-0000-7000-8000-0000000fa011',
    name: 'Entrega 1',
    due_on: '2026-12-01',
    status: 'pending',
  },
  awaiting_client: 1,
} as const;

export const PROJECT: PortalProjectDetail = {
  ...SUMMARY,
  description: 'Consulta de facturas y certificados.',
  milestones: [SUMMARY.next_milestone],
  deliverables: [
    {
      id: '01999a00-0000-7000-8000-0000000fa021',
      name: 'Módulo de facturas',
      description: null,
      version_label: '1.0.0',
      status: 'delivered',
      milestone: 'Entrega 1',
      acceptance: {
        status: 'in_signature',
        respond_by: '2026-11-17',
        delivered_at: '2026-11-07T15:00:00.000Z',
      },
    },
  ],
};

export function signature(overrides: Partial<PortalSignature> = {}): PortalSignature {
  return {
    id: ENVELOPE_ID,
    code: 'FE-2026-0001',
    kind: 'acceptance',
    document_code: 'FT-TEC-001-0001',
    document_title: 'Acta de entrega del módulo de facturas',
    status: 'sent',
    sent_at: '2026-11-07T15:00:00.000Z',
    expires_at: '2026-11-22T15:00:00.000Z',
    completed_at: null,
    signed: 0,
    signers: 2,
    my_turn: true,
    can_sign: true,
    ...overrides,
  };
}

export const CONTRACTS = {
  data: [
    {
      id: CONTRACT_ID,
      code: 'CTR-2026-0001',
      kind: 'contract',
      title: 'Desarrollo del portal',
      status: 'active',
      value: '45000000.00',
      starts_on: '2026-11-01',
      ends_on: '2027-10-31',
      signed_on: '2026-10-30',
      has_signed_copy: true,
    },
  ],
};

export function ticketDetail(overrides: Partial<PortalTicketDetail> = {}): PortalTicketDetail {
  return {
    id: TICKET_ID,
    code: 'TIQ-2026-0001',
    subject: 'No abre el reporte',
    category: 'support',
    priority: 'medium',
    status: 'waiting_customer',
    project: 'Portal de autogestión',
    requester: 'Ana Cliente',
    created_at: '2026-11-07T15:00:00.000Z',
    updated_at: '2026-11-07T16:00:00.000Z',
    description: 'El reporte mensual queda en blanco.',
    resolution: null,
    can_reply: true,
    messages: [
      {
        id: '01999a00-0000-7000-8000-0000000fa311',
        author: 'Equipo de soporte',
        from_client: false,
        body: '¿Desde qué navegador lo abre?',
        created_at: '2026-11-07T15:30:00.000Z',
      },
    ],
    ...overrides,
  };
}

export const USERS: PortalUserList = {
  projects: [{ id: PROJECT_ID, code: 'PRY-2026-0001', name: 'Portal de autogestión' }],
  data: [
    {
      id: SESSION.user.id,
      name: 'Ana Cliente',
      email: 'compras@cliente.test',
      role: 'CLIENTE_ADMIN',
      status: 'active',
      last_login_at: '2026-11-07T15:00:00.000Z',
      project_ids: [],
      is_me: true,
      version: 1,
    },
    {
      id: USER_ID,
      name: 'Luis Cliente',
      email: 'luis@cliente.test',
      role: 'CLIENTE_USUARIO',
      status: 'active',
      last_login_at: null,
      project_ids: [],
      is_me: false,
      version: 3,
    },
  ],
};

export const MY_DATA = {
  display_name: 'Ana Cliente',
  email: 'compras@cliente.test',
  company: 'Demo Uno S.A.S.',
  role: 'CLIENTE_ADMIN',
  second_factor: true,
  created_at: '2026-11-01T15:00:00.000Z',
  last_login_at: '2026-11-07T15:00:00.000Z',
  terms_accepted_at: '2026-11-07T15:00:00.000Z',
  version: 2,
};

/** Copia de los datos que descarga la persona. */
export const MY_EXPORT = {
  generated_at: '2026-11-07T15:00:00.000Z',
  account: { ...MY_DATA, version: undefined },
  terms: [],
  sessions: [],
  tickets: [],
  pqrsf: [],
};

export const ARTICLE = {
  id: ARTICLE_ID,
  title: 'Cómo descargar su factura',
  summary: 'Pasos para descargarla.',
  category: 'billing',
  published_at: '2026-11-01T15:00:00.000Z',
};

export const DOCUMENTS = {
  data: [
    {
      id: SHARED_ID,
      kind: 'shared',
      title: 'Manual de usuario',
      code: null,
      project: 'Portal de autogestión',
      dated_at: '2026-11-07T15:00:00.000Z',
    },
  ],
};

/** La API del portal simulada, con lo que se pida además. */
export function servePortal(permissions: object, extra: Routes = {}): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(PORTAL_SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/portal/terms': () => json(TERMS),
    'GET /v1/portal/home': () => json(HOME),
    'GET /v1/portal/projects': () => json({ data: [SUMMARY] }),
    [`GET /v1/portal/projects/${PROJECT_ID}`]: () => json(PROJECT),
    'GET /v1/portal/signatures': () => json({ pending: [signature()], recent: [] }),
    'GET /v1/portal/contracts': () => json(CONTRACTS),
    'GET /v1/portal/documents': () => json(DOCUMENTS),
    'GET /v1/portal/tickets': () => json({ data: [ticketDetail()] }),
    [`GET /v1/portal/tickets/${TICKET_ID}`]: () => json(ticketDetail()),
    'GET /v1/portal/pqrsf': () => json({ data: [] }),
    'GET /v1/portal/articles': () => json({ data: [ARTICLE] }),
    [`GET /v1/portal/articles/${ARTICLE_ID}`]: () =>
      json({ ...ARTICLE, body: 'Entre a Facturas.' }),
    'GET /v1/portal/users': () => json(USERS),
    'GET /v1/portal/me': () => json(MY_DATA),
    'GET /v1/files/download/llave': () => new Response(new Blob(['%PDF']), { status: 200 }),
    ...extra,
  });
}

/** Enlace de descarga simulado. */
export const DOWNLOAD_LINK = {
  url: 'http://api.test/v1/files/download/llave',
  expires_at: '2026-11-07T15:05:00.000Z',
};

/** La pantalla dentro de la sesión del portal. */
export function PortalScreen({ children }: { readonly children: ReactNode }): JSX.Element {
  return <RequireSession kind="portal">{children}</RequireSession>;
}

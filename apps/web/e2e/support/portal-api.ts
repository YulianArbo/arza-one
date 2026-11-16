import type { ApiRoutes } from './api-mock';

// La API del portal del cliente simulada (B30), para las pruebas de punta a punta. Datos ficticios.

const PORTAL_PROJECT = '01999a00-0000-7000-8000-0000000fa001';
const PORTAL_TICKET = '01999a00-0000-7000-8000-0000000fa301';

const TERMS_DOCUMENTS = [
  {
    id: '01999a00-0000-7000-8000-0000000fa701',
    key: 'portal_terms',
    title: 'Términos de uso del portal',
    body: 'Texto de prueba de los términos de uso del portal.',
    version_number: 1,
  },
  {
    id: '01999a00-0000-7000-8000-0000000fa702',
    key: 'privacy_policy',
    title: 'Política de tratamiento de datos personales',
    body: 'Texto de prueba de la política.',
    version_number: 1,
  },
];

export const ACCEPTED_TERMS = {
  status: 'accepted',
  accepted_at: '2026-11-07T15:00:00.000Z',
  documents: TERMS_DOCUMENTS,
};

export const PENDING_TERMS = { status: 'pending', accepted_at: null, documents: TERMS_DOCUMENTS };

const MILESTONE = {
  id: '01999a00-0000-7000-8000-0000000fa011',
  name: 'Entrega del módulo de facturas',
  due_on: '2026-12-01',
  status: 'pending',
};

const PROJECT = {
  id: PORTAL_PROJECT,
  code: 'PRY-2026-0001',
  name: 'Portal de autogestión para clientes',
  status: 'in_progress',
  starts_on: '2026-11-01',
  ends_on: '2027-03-01',
  progress_pct: 40,
  next_milestone: MILESTONE,
  awaiting_client: 1,
};

const TICKET = {
  id: PORTAL_TICKET,
  code: 'TIQ-2026-0001',
  subject: 'No abre el reporte mensual de ventas',
  category: 'support',
  priority: 'medium',
  status: 'waiting_customer',
  project: PROJECT.name,
  requester: 'Ana Cliente',
  created_at: '2026-11-07T15:00:00.000Z',
  updated_at: '2026-11-07T16:00:00.000Z',
};

const SIGNATURE = {
  id: '01999a00-0000-7000-8000-0000000fa101',
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
};

/** Todo lo que piden las secciones del portal. */
export const PORTAL_API: ApiRoutes = {
  '/v1/portal/invoices': { body: { data: [] } },
  '/v1/portal/terms': { body: ACCEPTED_TERMS },
  '/v1/portal/home': {
    body: {
      company: 'Demo Uno S.A.S.',
      projects: 1,
      next_milestones: [
        {
          project_id: PORTAL_PROJECT,
          project: PROJECT.name,
          name: MILESTONE.name,
          due_on: MILESTONE.due_on,
        },
      ],
      pending: { signatures: 1, approvals: 1, open_tickets: 1, waiting_tickets: 1 },
    },
  },
  '/v1/portal/projects': { body: { data: [PROJECT] } },
  [`/v1/portal/projects/${PORTAL_PROJECT}`]: {
    body: {
      ...PROJECT,
      description: 'Consulta de facturas y certificados.',
      milestones: [MILESTONE],
      deliverables: [
        {
          id: '01999a00-0000-7000-8000-0000000fa021',
          name: 'Módulo de facturas',
          description: null,
          version_label: '1.0.0',
          status: 'delivered',
          milestone: MILESTONE.name,
          acceptance: {
            status: 'in_signature',
            respond_by: '2026-11-17',
            delivered_at: '2026-11-07T15:00:00.000Z',
          },
        },
      ],
    },
  },
  '/v1/portal/signatures': {
    body: {
      pending: [
        SIGNATURE,
        {
          ...SIGNATURE,
          id: '01999a00-0000-7000-8000-0000000fa102',
          kind: 'contract',
          document_title: 'Contrato de desarrollo',
        },
      ],
      recent: [],
    },
  },
  '/v1/portal/contracts': {
    body: {
      data: [
        {
          id: '01999a00-0000-7000-8000-0000000fa201',
          code: 'CTR-2026-0001',
          kind: 'contract',
          title: 'Desarrollo del portal de autogestión',
          status: 'active',
          value: '45000000.00',
          starts_on: '2026-11-01',
          ends_on: '2027-10-31',
          signed_on: '2026-10-30',
          has_signed_copy: true,
        },
      ],
    },
  },
  '/v1/portal/documents': {
    body: {
      data: [
        {
          id: '01999a00-0000-7000-8000-0000000fa601',
          kind: 'shared',
          title: 'Manual de usuario del portal',
          code: null,
          project: PROJECT.name,
          dated_at: '2026-11-07T15:00:00.000Z',
        },
      ],
    },
  },
  '/v1/portal/tickets': { body: { data: [TICKET] } },
  [`/v1/portal/tickets/${PORTAL_TICKET}`]: {
    body: {
      ...TICKET,
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
    },
  },
  '/v1/portal/pqrsf': { body: { data: [] } },
  '/v1/portal/articles': {
    body: {
      data: [
        {
          id: '01999a00-0000-7000-8000-0000000fa401',
          title: 'Cómo descargar su factura',
          summary: 'Pasos para descargarla desde el portal.',
          category: 'billing',
          published_at: '2026-11-01T15:00:00.000Z',
        },
      ],
    },
  },
  '/v1/portal/users': {
    body: {
      projects: [{ id: PORTAL_PROJECT, code: PROJECT.code, name: PROJECT.name }],
      data: [
        {
          id: '01999a00-0000-7000-8000-00000000a001',
          name: 'Ana Cliente',
          email: 'cliente@cliente.test',
          role: 'CLIENTE_ADMIN',
          status: 'active',
          last_login_at: '2026-11-07T15:00:00.000Z',
          project_ids: [],
          is_me: true,
          version: 1,
        },
        {
          id: '01999a00-0000-7000-8000-0000000fa501',
          name: 'Luis Cliente',
          email: 'luis.cliente.con.correo.largo@cliente-de-prueba.test',
          role: 'CLIENTE_USUARIO',
          status: 'active',
          last_login_at: null,
          project_ids: [],
          is_me: false,
          version: 3,
        },
      ],
    },
  },
  '/v1/portal/me': {
    body: {
      display_name: 'Ana Cliente',
      email: 'cliente@cliente.test',
      company: 'Demo Uno S.A.S.',
      role: 'CLIENTE_ADMIN',
      second_factor: true,
      created_at: '2026-11-01T15:00:00.000Z',
      last_login_at: '2026-11-07T15:00:00.000Z',
      terms_accepted_at: '2026-11-07T15:00:00.000Z',
      version: 2,
    },
  },
};

/** Cada sección del portal y el texto que indica que ya cargó. */
export const PORTAL_PAGES = [
  { path: '/portal', ready: 'Bienvenido, Demo Uno S.A.S.' },
  { path: '/portal/proyectos', ready: 'Portal de autogestión para clientes' },
  { path: `/portal/proyectos/${PORTAL_PROJECT}`, ready: 'Módulo de facturas' },
  { path: '/portal/por-aprobar', ready: 'Acta de entrega del módulo de facturas' },
  { path: '/portal/firmas', ready: 'Desarrollo del portal de autogestión' },
  { path: '/portal/facturas', ready: 'Aún no hay facturas emitidas' },
  { path: '/portal/soporte', ready: 'No abre el reporte mensual de ventas' },
  { path: `/portal/soporte/${PORTAL_TICKET}`, ready: '¿Desde qué navegador lo abre?' },
  { path: '/portal/documentos', ready: 'Manual de usuario del portal' },
  { path: '/portal/usuarios', ready: 'Luis Cliente' },
  { path: '/portal/mis-datos', ready: 'Lo que guardamos de usted' },
] as const;

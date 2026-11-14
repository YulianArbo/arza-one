// Datos ficticios de horas, entregables, actas y control de Proyectos (B27). Ninguno es real.

import { json, type mockApi } from './fake-api';
import { DEVELOPER, ITEM_ID, LEADER, PROJECT_ID, TESTER } from './project-ids';

type Routes = Parameters<typeof mockApi>[0];

const FILE_ID = '01999a00-0000-7000-8000-0000000f0001';
export const DELIVERABLE_ID = '01999a00-0000-7000-8000-0000000e0601';
export const ENTRY_ID = '01999a00-0000-7000-8000-0000000e0701';
export const RISK_ID = '01999a00-0000-7000-8000-0000000e0801';
export const INCIDENT_ID = '01999a00-0000-7000-8000-0000000e0901';

const ENTRY = {
  id: ENTRY_ID,
  project: { id: PROJECT_ID, code: 'PRY-2026-0001', name: 'Portal de clientes' },
  item: { id: ITEM_ID, number: 2, title: 'Consultar facturas' },
  person: DEVELOPER,
  work_date: '2026-11-04',
  hours: 3.5,
  billable: true,
  note: 'Pantalla de facturas.',
  status: 'registered',
  decision_note: null,
  decided_by: null,
  version: 1,
};

const TIME_ENTRIES = {
  data: [
    ENTRY,
    {
      ...ENTRY,
      id: '01999a00-0000-7000-8000-0000000e0702',
      person: LEADER,
      hours: 2,
      item: null,
      billable: false,
      status: 'returned',
      decision_note: 'Indique el ítem.',
    },
  ],
  total_hours: 5.5,
};

const TIME_OPTIONS = {
  projects: [
    {
      id: PROJECT_ID,
      code: 'PRY-2026-0001',
      name: 'Portal de clientes',
      items: [{ id: ITEM_ID, number: 2, title: 'Consultar facturas' }],
    },
  ],
  earliest_date: '2026-10-29',
  today: '2026-11-05',
};

function deliverable(overrides: object = {}): object {
  return {
    id: DELIVERABLE_ID,
    name: 'Portal de autogestión',
    description: null,
    version_label: '1.0.0',
    milestone: { id: '01999a00-0000-7000-8000-0000000e0401', name: 'Anticipo' },
    evidence_url: null,
    status: 'preparing',
    acceptance: null,
    version: 2,
    ...overrides,
  };
}

const ACCEPTANCE = {
  id: '01999a00-0000-7000-8000-0000000e0602',
  status: 'accepted',
  record_code: 'FT-TEC-001-2026-0001',
  envelope_code: 'FE-2026-0001',
  signer_name: 'Laura Gómez',
  delivered_by: LEADER,
  delivered_at: '2026-11-05T15:00:00.000Z',
  respond_by: '2026-11-15',
  answered_at: '2026-11-06T15:00:00.000Z',
  client_note: null,
  signed_pdf: true,
};

export const DELIVERY_OPTIONS = {
  signers: [
    { id: TESTER.id, name: 'Laura Gómez', ready: true },
    { id: DEVELOPER.id, name: 'Pedro Sin Correo', ready: false },
  ],
  respond_days: 10,
  tacit_acceptance: false,
  form_ready: true,
};

const RISK = {
  id: RISK_ID,
  description: 'Cambia la interfaz del proveedor de pagos.',
  probability: 4,
  impact: 5,
  level: 'high',
  response: 'Encapsular la integración.',
  owner: LEADER,
  status: 'open',
  version: 1,
};

const RELEASE = {
  id: '01999a00-0000-7000-8000-0000000e0a01',
  version_label: '1.0.0',
  environment: 'test',
  released_on: '2026-11-04',
  notes: 'Primera versión.',
  test_report: { id: FILE_ID, file_name: 'informe.pdf' },
  released_by: LEADER,
};

const INCIDENT = {
  id: INCIDENT_ID,
  code: 'INC-2026-0001',
  title: 'Caída del portal',
  kind: 'failure',
  severity: 'critical',
  description: 'No respondió diez minutos.',
  detected_at: '2026-11-04T15:00:00.000Z',
  personal_data: true,
  status: 'open',
  resolved_at: null,
  root_cause: null,
  actions: null,
  reported_by: LEADER,
  version: 1,
};

const INDICATORS = {
  progress: { planned: 2, done: 1, percent: 50 },
  hours: { budget: 480.5, logged: 10, approved: 6, billable: 4, pending: 4, used_pct: 1 },
  schedule: { elapsed_pct: 10, deviation_pts: 40 },
  money: { income: '12000000.00', cost: '270000.00', margin: '11730000.00', margin_pct: 97 },
  deliverables: { total: 2, accepted: 1, waiting: 1 },
  risks_high: 1,
  incidents_open: 1,
};

const PDF_FILE = {
  id: FILE_ID,
  file_name: 'informe.pdf',
  mime_type: 'application/pdf',
  size_bytes: 2048,
  sha256: 'd'.repeat(64),
  status: 'available',
  rejection: null,
  created_at: '2026-11-04T15:00:00.000Z',
};

/** Las secciones del B27 con datos por omisión. */
export function controlRoutes(): Routes {
  const base = `/v1/projects/${PROJECT_ID}`;
  const accepted = deliverable({ id: ITEM_ID, status: 'accepted', acceptance: ACCEPTANCE });
  return {
    [`GET ${base}/time-entries`]: () => json(TIME_ENTRIES),
    'GET /v1/time-entries/options': () => json(TIME_OPTIONS),
    'GET /v1/time-entries/mine': () => json(TIME_ENTRIES),
    [`GET ${base}/deliverables`]: () => json({ data: [deliverable(), accepted] }),
    [`GET ${base}/deliverables/options`]: () => json(DELIVERY_OPTIONS),
    [`GET ${base}/risks`]: () => json({ data: [RISK] }),
    [`GET ${base}/releases`]: () => json({ data: [RELEASE] }),
    [`GET ${base}/incidents`]: () => json({ data: [INCIDENT] }),
    [`GET ${base}/indicators`]: () => json(INDICATORS),
    'GET /v1/files': () => json({ data: [PDF_FILE] }),
  };
}

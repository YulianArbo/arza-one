// Datos ficticios de las pruebas de las pantallas de Contratos (B24). Ninguno es real.

import type { PermissionCode } from '@arza/contracts';

import { SESSION, json, mockApi, type SentRequest } from './fake-api';
import { ORG_ID, permissionsOf } from './party-fixtures';

export const CONTRACT_ID = '01999a00-0000-7000-8000-0000000d0001';
export const TEMPLATE_ID = '01999a00-0000-7000-8000-0000000d0101';
export const QUOTE_ID = '01999a00-0000-7000-8000-0000000c0501';
export const OBLIGATION_ID = '01999a00-0000-7000-8000-0000000d0301';
export const AMENDMENT_ID = '01999a00-0000-7000-8000-0000000d0401';
export const PDF_FILE_ID = '01999a00-0000-7000-8000-00000000d001';
const MODIFIED_ID = '01999a00-0000-7000-8000-0000000d0202';
const ADDED_ID = '01999a00-0000-7000-8000-0000000d0203';
const AUTHOR = { id: SESSION.user.id, name: 'Ana Pérez' };
const DIRECTOR = { id: '01999a00-0000-7000-8000-00000000a002', name: 'Diego Director' };

const WRITE: readonly PermissionCode[] = [
  'party.read',
  'contract.read',
  'contract.create',
  'contract.update',
  'wf.task.work',
];

export const CONTRACT_WRITER = permissionsOf(WRITE);
export const CONTRACT_DIRECTION = permissionsOf([
  ...WRITE,
  'contract.approve',
  'contract.terminate',
  'contract.renew',
  'contract.clause.manage',
]);
export const CONTRACT_READER = permissionsOf(['contract.read']);

export const TEMPLATE = {
  id: TEMPLATE_ID,
  code: 'CT-COM-001',
  name: 'Contrato de prestación de servicios de desarrollo de software',
  kind: 'contract',
  version: '01',
  clauses: [
    { key: 'partes-contrato', title: 'Partes', required: true },
    { key: 'objeto-desarrollo', title: 'Objeto', required: true },
    { key: 'garantia', title: 'Garantía', required: false },
  ],
} as const;

const SUMMARY = {
  id: CONTRACT_ID,
  code: 'CTR-2026-0001',
  kind: 'contract',
  title: 'Portal de clientes',
  party: { id: ORG_ID, name: 'Comercializadora Andina S.A.S.' },
  status: 'draft',
  value: '12000000.00',
  starts_on: '2026-11-01',
  ends_on: '2027-10-31',
  responsible: AUTHOR,
  has_modified_clauses: false,
  created_at: '2026-10-29T15:00:00.000Z',
  version: 2,
} as const;

const CLAUSES = [
  {
    id: '01999a00-0000-7000-8000-0000000d0201',
    position: 1,
    ordinal: null,
    clause_key: 'partes-contrato',
    clause_version: 1,
    title: 'Partes',
    body: 'Entre ARZA TECH S.A.S. y Comercializadora Andina S.A.S.',
    origin: 'library',
    library_text: null,
    required: true,
  },
  {
    id: MODIFIED_ID,
    position: 2,
    ordinal: 'PRIMERA',
    clause_key: 'garantia',
    clause_version: 1,
    title: 'Garantía',
    body: 'Seis meses de garantía.',
    origin: 'modified',
    library_text: 'Tres meses de garantía.',
    required: false,
  },
  {
    id: ADDED_ID,
    position: 3,
    ordinal: 'SEGUNDA',
    clause_key: null,
    clause_version: null,
    title: 'Cláusula penal',
    body: 'Una pena del 10 % del valor.',
    origin: 'added',
    library_text: null,
    required: false,
  },
];

export const OBLIGATION = {
  id: OBLIGATION_ID,
  description: 'Entregar el prototipo navegable',
  responsible: AUTHOR,
  due_on: '2026-11-15',
  status: 'pending',
  done_at: null,
  done_note: null,
  version: 1,
} as const;

export const AMENDMENT = {
  id: AMENDMENT_ID,
  code: 'CTR-2026-0001-OT01',
  kind: 'amendment',
  status: 'in_review',
  summary: 'Se amplía el alcance con el módulo de pagos',
  body: 'Las partes acuerdan incluir el módulo de pagos en línea.',
  effective_on: '2026-11-01',
  new_ends_on: '2027-12-31',
  new_value: '15000000.00',
  author: AUTHOR,
  decided_by: null,
  decision_note: null,
  pdf_ready: false,
  signed_on: null,
  created_at: '2026-10-29T16:00:00.000Z',
  version: 2,
} as const;

/** Ficha de un contrato; por omisión, un borrador sin cláusulas cambiadas. */
export function contractDetail(overrides: object = {}): object {
  return {
    ...SUMMARY,
    object: 'desarrollar el portal de autogestión de los clientes',
    payment_terms: '50 % al iniciar y 50 % a la entrega',
    renewal: 'by_agreement',
    client_signer_name: 'Laura Gómez',
    client_signer_document: 'CC 43000000',
    template: { id: TEMPLATE_ID, code: 'CT-COM-001', name: TEMPLATE.name },
    quote: null,
    author: AUTHOR,
    clauses: CLAUSES.slice(0, 1),
    approval: {
      submitted_at: null,
      decided_by: null,
      decided_at: null,
      note: null,
      legal_note: null,
    },
    pdf: { status: 'none', file_name: null, sha256: null },
    signed: null,
    termination: null,
    last_alert_days: null,
    obligations: [],
    amendments: [],
    ...overrides,
  };
}

/** Con la garantía cambiada y una cláusula penal nueva. */
export const MODIFIED = { clauses: CLAUSES, has_modified_clauses: true };

export const APPROVED = {
  status: 'approved',
  approval: {
    submitted_at: '2026-10-29T16:00:00.000Z',
    decided_by: DIRECTOR,
    decided_at: '2026-10-29T17:00:00.000Z',
    note: null,
    legal_note: null,
  },
  pdf: { status: 'ready', file_name: 'CTR-2026-0001.pdf', sha256: 'b'.repeat(64) },
};

export const ACTIVE = {
  ...APPROVED,
  status: 'active',
  signed: {
    file: { id: PDF_FILE_ID, file_name: 'contrato-firmado.pdf' },
    signed_on: '2026-10-30',
    by: AUTHOR,
  },
};

export const OPTIONS = {
  templates: [TEMPLATE],
  signers: [{ name: 'Laura Gómez', document: 'CC 43000000' }],
  quote: null,
};

export const QUOTE_OPTIONS = {
  ...OPTIONS,
  quote: {
    id: QUOTE_ID,
    code: 'COT-2026-0001',
    version_number: 1,
    party: { id: ORG_ID, name: 'Comercializadora Andina S.A.S.' },
    title: 'Portal de clientes',
    object: 'Desarrollo a la medida',
    value: '960925.00',
    payment_terms: '50 % al iniciar y 50 % a la entrega',
  },
};

export const CLAUSE = {
  key: 'garantia',
  version: 1,
  title: 'Garantía',
  body: 'EL CONTRATISTA garantiza durante tres (3) meses lo entregado.',
  numbered: true,
  legal_validated: false,
  approved_by: null,
  approved_at: '2026-10-29T05:00:00.000Z',
  templates: ['CT-COM-001', 'OS-COM-001'],
};

export const PDF_FILE = {
  id: PDF_FILE_ID,
  file_name: 'contrato-firmado.pdf',
  mime_type: 'application/pdf',
  size_bytes: 204_800,
  sha256: 'c'.repeat(64),
  status: 'available',
  rejection: null,
  created_at: '2026-10-30T15:00:00.000Z',
};

type Routes = Parameters<typeof mockApi>[0];

export function serveContracts(permissions: object, extra: Routes = {}): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/contracts': () => json({ data: [SUMMARY], next_cursor: null }),
    [`GET /v1/contracts/${CONTRACT_ID}`]: () => json(contractDetail()),
    'GET /v1/contracts/options': () => json(OPTIONS),
    'GET /v1/contract-clauses': () => json({ data: [CLAUSE] }),
    'GET /v1/parties': () => json({ data: [], next_cursor: null }),
    'GET /v1/files': () => json({ data: [PDF_FILE] }),
    'GET /v1/comments': () => json({ items: [] }),
    'GET /v1/attachments': () => json({ items: [] }),
    ...extra,
  });
}

/** La ficha del contrato con lo que se pida. */
export function detailRoute(overrides: object): Routes {
  return { [`GET /v1/contracts/${CONTRACT_ID}`]: () => json(contractDetail(overrides)) };
}

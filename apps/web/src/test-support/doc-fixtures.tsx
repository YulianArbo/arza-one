// Datos ficticios de las pruebas de las pantallas de documentos (B18). Ninguno es real.

import type { PermissionCode } from '@arza/contracts';

import { SESSION, json, mockApi, type SentRequest } from './fake-api';
import { catalog } from './party-fixtures';

const ROOT_ID = '01999a00-0000-7000-8000-00000000b001';
export const FOLDER_ID = '01999a00-0000-7000-8000-00000000b002';
export const DOCUMENT_ID = '01999a00-0000-7000-8000-00000000b101';
export const VERSION_ID = '01999a00-0000-7000-8000-00000000b201';
export const PDF_ID = '01999a00-0000-7000-8000-00000000b301';
export const PROCESS_ID = '01999a00-0000-7000-8000-00000000b401';
const POSITION_ID = '01999a00-0000-7000-8000-00000000b402';
export const LINK_ID = '01999a00-0000-7000-8000-00000000b501';
export const REQUEST_ID = '01999a00-0000-7000-8000-00000000b601';
export const UPLOAD_LINK = 'http://api.test/v1/files/uploads/llave';
const DOWNLOAD_LINK = 'http://api.test/v1/files/downloads/llave';

function docPermissions(codes: readonly PermissionCode[]): object {
  return {
    roles: [{ id: '01999a00-0000-7000-8000-00000000c040', code: 'CALIDAD', name: 'Calidad' }],
    permissions: codes.map((code) => ({ code, scope: 'all' })),
  };
}

const QUALITY_CODES: readonly PermissionCode[] = [
  'doc.document.read',
  'doc.document.create',
  'doc.document.update',
  'doc.version.submit',
  'doc.version.review',
  'doc.version.approve',
  'doc.version.publish',
  'doc.version.obsolete',
  'party.read',
  'core.org.read',
  'core.parameter.read',
];

export const QUALITY = docPermissions(QUALITY_CODES);

/** Calidad con lo del control documental (B19): solicitudes y exportar el Listado Maestro. */
export const QUALITY_SGC = docPermissions([
  ...QUALITY_CODES,
  'doc.change_request.create',
  'doc.change_request.decide',
  'doc.export',
]);

export const READER = docPermissions(['doc.document.read', 'core.org.read']);

function folder(overrides: object): Record<string, unknown> {
  return {
    id: ROOT_ID,
    parent_id: null,
    code: 'SGC',
    name: 'Sistema de Gestión de Calidad',
    kind: 'folder',
    entity_type: null,
    entity_id: null,
    entity_name: null,
    classification: 'internal',
    document_count: 0,
    version: 1,
    ...overrides,
  };
}

const FOLDERS = {
  data: [
    folder({}),
    folder({
      id: FOLDER_ID,
      parent_id: ROOT_ID,
      code: 'SGC-SGC',
      name: 'Gestión de la Calidad',
      document_count: 1,
    }),
  ],
};

export function documentOf(overrides: object = {}): Record<string, unknown> {
  return {
    id: DOCUMENT_ID,
    code: 'PR-SGC-001',
    title: 'Control de documentos',
    doc_type: 'PR',
    doc_type_label: 'Procedimiento',
    is_controlled: true,
    process: { id: PROCESS_ID, code: 'SGC', name: 'Gestión de la Calidad' },
    folder_id: FOLDER_ID,
    classification: 'internal',
    owner_position: null,
    status: 'current',
    current_version: {
      id: VERSION_ID,
      label: '00',
      status: 'current',
      effective_date: '2026-10-16',
    },
    open_version: null,
    created_at: '2026-10-15T15:00:00.000Z',
    version: 2,
    ...overrides,
  };
}

const PDF = {
  id: PDF_ID,
  file_name: 'Control de documentos.pdf',
  mime_type: 'application/pdf',
  size_bytes: 2048,
  sha256: 'a'.repeat(64),
};

export function versionOf(overrides: object = {}): Record<string, unknown> {
  return {
    id: VERSION_ID,
    document_id: DOCUMENT_ID,
    number: 0,
    label: '00',
    status: 'current',
    render_status: 'ready',
    title: 'Control de documentos',
    classification: 'internal',
    owner_position: null,
    change_summary: 'Creación del documento',
    review_note: null,
    source_file: PDF,
    pdf_file: PDF,
    created_by: { id: '01999a00-0000-7000-8000-00000000a002', name: 'Carlos Ruiz' },
    created_at: '2026-10-15T15:00:00.000Z',
    submitted_at: '2026-10-15T16:00:00.000Z',
    approved_by: { id: SESSION.user.id, name: 'Ana Pérez' },
    approved_at: '2026-10-16T13:00:00.000Z',
    effective_date: '2026-10-16',
    published_at: '2026-10-16T13:05:00.000Z',
    obsoleted_at: null,
    origin: 'platform',
    change_request: null,
    workflow_instance_id: null,
    step: null,
    actions: ['obsolete'],
    version: 4,
    ...overrides,
  };
}

const ORG_UNITS = {
  data: [
    {
      id: PROCESS_ID,
      parent_id: null,
      code: 'SGC',
      name: 'Gestión de la Calidad',
      kind: 'process',
      owner_position_id: null,
      is_active: true,
      version: 1,
    },
  ],
};

const POSITIONS = {
  data: [
    {
      id: POSITION_ID,
      org_unit_id: PROCESS_ID,
      name: 'Coordinador de Calidad',
      reports_to_id: null,
      is_active: true,
      version: 1,
    },
  ],
};

/** Solicitud de Acción Documental de prueba (B19). */
export function requestOf(overrides: object = {}): Record<string, unknown> {
  return {
    id: REQUEST_ID,
    code: 'SAD-2026-0001',
    action: 'create',
    status: 'approved',
    title: 'Control de documentos',
    justification: 'El proceso necesita controlar sus documentos.',
    document: null,
    doc_type: 'PR',
    process: { id: PROCESS_ID, code: 'SGC', name: 'Gestión de la Calidad' },
    requested_by: { id: SESSION.user.id, name: 'Ana Pérez' },
    requested_at: '2026-10-15T14:00:00.000Z',
    decided_by: { id: '01999a00-0000-7000-8000-00000000a002', name: 'Carlos Ruiz' },
    decided_at: '2026-10-15T15:00:00.000Z',
    decision_note: null,
    executed_at: null,
    workflow_instance_id: null,
    step: null,
    actions: [],
    version: 3,
    ...overrides,
  };
}

type Routes = Record<string, (request: SentRequest) => Response>;

/** API simulada de documentos con la sesión de Ana y los permisos dados. */
export function serveDocuments(permissions: object, extra: Routes = {}): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions),
    'GET /v1/folders': () => json(FOLDERS),
    'GET /v1/documents': () => json({ data: [documentOf()], next_cursor: null }),
    [`GET /v1/documents/${DOCUMENT_ID}`]: () => json(documentOf()),
    [`GET /v1/documents/${DOCUMENT_ID}/versions`]: () => json({ data: [versionOf()] }),
    [`GET /v1/documents/${DOCUMENT_ID}/links`]: () => json({ data: [] }),
    [`POST /v1/versions/${VERSION_ID}/download-link`]: () =>
      json({ url: DOWNLOAD_LINK, expires_at: '2026-10-16T15:05:00.000Z' }),
    'GET /v1/files/downloads/llave': () => new Response('%PDF-1.7'),
    'GET /v1/org-units': () => json(ORG_UNITS),
    'GET /v1/positions': () => json(POSITIONS),
    'GET /v1/parties': () => json({ data: [], next_cursor: null }),
    'GET /v1/change-requests': () => json({ data: [requestOf()], next_cursor: null }),
    'GET /v1/catalogs/document_types': () =>
      json(catalog('document_types', [['PR', 'Procedimiento']])),
    ...extra,
  });
}

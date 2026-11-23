// Datos ficticios de las pantallas de solicitudes de titulares, incidentes y cookies (B42).
// Ninguno es real.

import { privacyPermissions } from './privacy-fixtures';

export const REQUEST_ID = '01999a00-0000-7000-8000-00000000e001';
export const INCIDENT_ID = '01999a00-0000-7000-8000-00000000e101';
export const HOLDER_ID = '01999a00-0000-7000-8000-00000000d402';
export const EXPORT_ID = '01999a00-0000-7000-8000-00000000e201';

export const DPO = privacyPermissions([
  'privacy.notice.manage',
  'privacy.request.manage',
  'privacy.request.respond',
  'privacy.data.export',
  'privacy.data.erase',
  'privacy.incident.manage',
  'party.read',
]);

export function requestSummary(overrides: object = {}): Record<string, unknown> {
  return {
    id: REQUEST_ID,
    code: 'PRV-2026-0001',
    right: 'know',
    kind: 'inquiry',
    channel: 'web',
    status: 'received',
    requester_name: 'Titular Ficticio',
    party: null,
    received_at: '2026-11-20T15:00:00.000Z',
    due_on: '2026-12-04',
    overdue: false,
    extended: false,
    paused: false,
    version: 1,
    ...overrides,
  };
}

export function requestDetail(overrides: object = {}): Record<string, unknown> {
  return {
    ...requestSummary(),
    requester_email: 'titular@ejemplo.test',
    requester_phone: null,
    document_number: '1000000001',
    description: 'Quiero conocer mis datos.',
    source_code: null,
    verification: null,
    requirement: null,
    extension_reason: null,
    requirement_open_until: null,
    response: null,
    responded_at: null,
    closure: null,
    closed_at: null,
    exports: [],
    erasure: null,
    events: [
      {
        kind: 'received',
        note: null,
        actor: null,
        occurred_at: '2026-11-20T15:00:00.000Z',
        mailed_at: '2026-11-20T15:01:00.000Z',
      },
    ],
    ...overrides,
  };
}

/** En trámite, con la identidad verificada contra la ficha del titular. */
export function verifiedDetail(overrides: object = {}): Record<string, unknown> {
  return requestDetail({
    status: 'in_progress',
    party: { id: HOLDER_ID, name: 'Laura Titular' },
    verification: {
      method: 'document',
      note: 'Cédula revisada.',
      verified_at: '2026-11-21T15:00:00.000Z',
      verified_by: 'Ana Oficial',
    },
    version: 3,
    ...overrides,
  });
}

export function incidentDetail(overrides: object = {}): Record<string, unknown> {
  return {
    id: INCIDENT_ID,
    code: 'IDP-2026-0001',
    title: 'Correo a un destinatario equivocado',
    status: 'open',
    detected_at: '2026-11-20T15:00:00.000Z',
    affected_count: 12,
    sensitive: false,
    sic_due_on: '2026-12-11',
    reported_on: null,
    overdue: false,
    version: 1,
    description: 'Se envió un archivo con datos de contacto a una persona externa.',
    data_categories: ['contact'],
    project_incident_ref: null,
    contained_at: null,
    containment_note: null,
    sic_reference: null,
    holders_notified_on: null,
    holders_notice: null,
    not_reportable_reason: null,
    closed_at: null,
    measures: [],
    ...overrides,
  };
}

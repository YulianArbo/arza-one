import type request from 'supertest';
import supertest from 'supertest';

import { WEB_ORIGIN, freshIp } from '../../iam/support/iam-fixtures.js';
import type { AccessScenario } from '../../iam/support/access-scenario.js';
import {
  approvedRequest,
  code,
  created,
  documentBody,
  newDocument,
  quality,
  step,
  versionAt,
  versionBody,
} from './doc-sgc-steps.js';

// Llamadas del recorrido de escrituras (B11) para carpetas, documentos y versiones (B18). Desde
// B19 las versiones avanzan por su trámite y los cambios del SGC llevan su solicitud aprobada.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

export const DOC_DOCUMENT_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/folders': async (s) => {
    const person = await quality(s);
    return { test: s.post('/v1/folders', person.session, { parent_id: null, name: 'Actas' }) };
  },
  'PATCH /v1/folders/{id}': async (s) => {
    const person = await quality(s);
    const id = await created(
      s.post('/v1/folders', person.session, { parent_id: null, name: 'Actas' }),
    );
    const body = { name: 'Actas de comité', classification: 'internal' };
    return { test: s.patch(`/v1/folders/${id}`, person.session, body, 1) };
  },
  'POST /v1/documents': async (s) => {
    const person = await quality(s);
    return { test: s.post('/v1/documents', person.session, await documentBody(s, person)) };
  },
  'POST /v1/documents/{id}/versions': async (s) => {
    const { approver, id } = await versionAt(s, ['submit', 'review', 'approve', 'publish']);
    const request = { action: 'update', documentId: id } as const;
    const body = {
      ...(await versionBody(s, approver)),
      change_request_id: await approvedRequest(s, approver, request),
    };
    return { test: s.post(`/v1/documents/${id}/versions`, approver.session, body) };
  },
  'PATCH /v1/versions/{id}': async (s) => {
    const { author, version } = await versionAt(s, []);
    const body = await versionBody(s, author);
    return { test: s.patch(`/v1/versions/${version.id}`, author.session, body, version.version) };
  },
  'POST /v1/versions/{id}/actions/submit': async (s) => {
    const { author, version } = await versionAt(s, []);
    return { test: step(s, author, version, 'submit') };
  },
  'POST /v1/versions/{id}/actions/reject': async (s) => {
    const { approver, version } = await versionAt(s, ['submit']);
    return { test: step(s, approver, version, 'reject', { note: 'Falta el alcance' }) };
  },
  'POST /v1/versions/{id}/actions/approve': async (s) => {
    const { approver, version } = await versionAt(s, ['submit']);
    return { test: step(s, approver, version, 'approve') };
  },
  'POST /v1/versions/{id}/actions/publish': async (s) => {
    const { approver, version } = await versionAt(s, ['submit', 'review', 'approve']);
    return { test: step(s, approver, version, 'publish') };
  },
  'POST /v1/versions/{id}/actions/obsolete': async (s) => {
    const steps = ['submit', 'review', 'approve', 'publish'] as const;
    const { approver, id, version } = await versionAt(s, steps);
    const request = await approvedRequest(s, approver, { action: 'obsolete', documentId: id });
    const body = { reason: 'Ya no se usa', change_request_id: request };
    return { test: step(s, approver, version, 'obsolete', body) };
  },
  'POST /v1/versions/{id}/download-link': async (s) => {
    const { author, version } = await versionAt(s, []);
    return { test: s.post(`/v1/versions/${version.id}/download-link`, author.session) };
  },
  'POST /v1/documents/{id}/links': async (s) => {
    const person = await quality(s);
    const id = await newDocument(s, person);
    const body = {
      entity_type: 'process',
      entity_id: await code(s, 'orgUnit', 'COM'),
      relation: 'related',
    };
    return { test: s.post(`/v1/documents/${id}/links`, person.session, body) };
  },
  'DELETE /v1/documents/{id}/links/{linkId}': async (s) => {
    const person = await quality(s);
    const id = await newDocument(s, person);
    const body = {
      entity_type: 'process',
      entity_id: await code(s, 'orgUnit', 'COM'),
      relation: 'related',
    };
    const linkId = await created(s.post(`/v1/documents/${id}/links`, person.session, body));
    return {
      test: supertest(s.app.getHttpServer())
        .delete(`/v1/documents/${id}/links/${linkId}`)
        .set('Origin', WEB_ORIGIN)
        .set('X-Forwarded-For', freshIp())
        .set('Cookie', person.session.cookie)
        .set('X-CSRF-Token', person.session.session.csrf_token),
    };
  },
};

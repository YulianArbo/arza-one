import { createHash } from 'node:crypto';

import {
  createdResponseSchema,
  uploadLinkResponseSchema,
  versionListResponseSchema,
  type Version,
} from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import { seedCore } from '../../../../src/modules/core/index.js';
import { seedDocFolders } from '../../../../src/modules/doc/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { apiDatabase } from '../../support/integration-database.js';
import { WEB_ORIGIN, freshIp, type SignedIn } from '../../iam/support/iam-fixtures.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { samplePdf } from '../../doc/support/file-scenario.js';

// Llamadas del recorrido de escrituras (B11) para carpetas, documentos y versiones (B18). Los
// archivos quedan disponibles sin el worker, con su huella real para que la descarga la verifique.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

async function seeded(s: AccessScenario): Promise<void> {
  await seedCore(apiDatabase(), [s.tenant.id], systemClock);
  await seedDocFolders(apiDatabase(), [s.tenant.id], systemClock);
}

function quality(s: AccessScenario, label = 'calidad-recorrido'): Promise<Person> {
  return s.person(label, ['CALIDAD']);
}

async function created(test: request.Test): Promise<string> {
  const response = await test;
  expect(response.status, response.text).toBe(201);
  return createdResponseSchema.parse(response.body).id;
}

async function pdf(s: AccessScenario, session: SignedIn): Promise<string> {
  const content = samplePdf();
  const response = await s.post('/v1/files', session, {
    file_name: 'acta.pdf',
    mime_type: 'application/pdf',
    size_bytes: content.length,
  });
  const link = uploadLinkResponseSchema.parse(response.body);
  await request(s.app.getHttpServer())
    .put(new URL(link.upload_url).pathname)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Content-Type', 'application/pdf')
    .send(content);
  const sha256 = createHash('sha256').update(content).digest('hex');
  await s.db.withTenant({ tenantId: s.tenant.id, userId: null }, (tx) =>
    tx.file.update({
      where: { id: link.id },
      data: { scanStatus: 'available', sha256, scannedAt: new Date() },
    }),
  );
  return link.id;
}

async function code(s: AccessScenario, table: 'docFolder' | 'orgUnit', value: string) {
  return s.inTenant(async (tx) =>
    table === 'docFolder'
      ? (await tx.docFolder.findFirstOrThrow({ where: { code: value } })).id
      : (await tx.orgUnit.findFirstOrThrow({ where: { code: value } })).id,
  );
}

async function versionBody(s: AccessScenario, person: Person) {
  return {
    title: 'Procedimiento del recorrido',
    classification: 'internal',
    owner_position_id: null,
    source_file_id: await pdf(s, person.session),
    change_summary: 'Recorrido de auditoría',
  };
}

async function newDocument(s: AccessScenario, person: Person): Promise<string> {
  await seeded(s);
  return created(
    s.post('/v1/documents', person.session, {
      folder_id: await code(s, 'docFolder', 'SGC-SGC'),
      doc_type: 'PR',
      is_controlled: true,
      process_id: await code(s, 'orgUnit', 'SGC'),
      ...(await versionBody(s, person)),
    }),
  );
}

async function latest(s: AccessScenario, person: Person, documentId: string): Promise<Version> {
  const response = await s.get(`/v1/documents/${documentId}/versions`, person.session);
  const [version] = versionListResponseSchema.parse(response.body).data;
  if (version === undefined) throw new Error('Sin versiones.');
  return version;
}

function step(s: AccessScenario, person: Person, version: Version, action: string, body = {}) {
  return s
    .post(`/v1/versions/${version.id}/actions/${action}`, person.session, body)
    .set('If-Match', `"${String(version.version)}"`);
}

/** Documento con su versión llevada hasta el estado pedido, por dos personas de calidad. */
async function versionAt(s: AccessScenario, steps: readonly string[]) {
  const author = await quality(s, 'elabora-recorrido');
  const approver = await quality(s, 'aprueba-recorrido');
  const id = await newDocument(s, author);
  for (const action of steps) {
    const actor = action === 'submit' ? author : approver;
    await step(s, actor, await latest(s, actor, id), action);
  }
  return { author, approver, id, version: await latest(s, approver, id) };
}

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
    await seeded(s);
    return {
      test: s.post('/v1/documents', person.session, {
        folder_id: await code(s, 'docFolder', 'SGC-SGC'),
        doc_type: 'PR',
        is_controlled: true,
        process_id: await code(s, 'orgUnit', 'SGC'),
        ...(await versionBody(s, person)),
      }),
    };
  },
  'POST /v1/documents/{id}/versions': async (s) => {
    const { approver, id } = await versionAt(s, ['submit', 'approve', 'publish']);
    const body = await versionBody(s, approver);
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
    const { approver, version } = await versionAt(s, ['submit', 'approve']);
    return { test: step(s, approver, version, 'publish') };
  },
  'POST /v1/versions/{id}/actions/obsolete': async (s) => {
    const { approver, version } = await versionAt(s, ['submit', 'approve', 'publish']);
    return { test: step(s, approver, version, 'obsolete', { reason: 'Ya no se usa' }) };
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
      test: request(s.app.getHttpServer())
        .delete(`/v1/documents/${id}/links/${linkId}`)
        .set('Origin', WEB_ORIGIN)
        .set('X-Forwarded-For', freshIp())
        .set('Cookie', person.session.cookie)
        .set('X-CSRF-Token', person.session.session.csrf_token),
    };
  },
};

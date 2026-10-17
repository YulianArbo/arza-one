import { createHash } from 'node:crypto';

import {
  createdResponseSchema,
  uploadLinkResponseSchema,
  versionListResponseSchema,
  type Version,
} from '@arza/contracts';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { expect } from 'vitest';

import { seedCore } from '../../../../src/modules/core/index.js';
import { seedDocFolders, seedDocWorkflows } from '../../../../src/modules/doc/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { apiDatabase } from '../../support/integration-database.js';
import { WEB_ORIGIN, freshIp, type SignedIn } from '../../iam/support/iam-fixtures.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { samplePdf } from '../../doc/support/file-scenario.js';

// Pasos comunes del recorrido de escrituras (B11) para documentos y versiones (B18) y su control
// documental (B19): el núcleo, las carpetas y los flujos sembrados, archivos disponibles sin el
// worker y solicitudes de acción documental ya aprobadas, escritas en la base.

export async function seeded(s: AccessScenario): Promise<void> {
  const tenants = [s.tenant.id];
  await seedCore(apiDatabase(), tenants, systemClock);
  await seedDocFolders(apiDatabase(), tenants, systemClock);
  await seedDocWorkflows(apiDatabase(), tenants, systemClock);
}

export function quality(s: AccessScenario, label = 'calidad-recorrido'): Promise<Person> {
  return s.person(label, ['CALIDAD']);
}

export async function created(test: request.Test): Promise<string> {
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

export async function code(
  s: AccessScenario,
  table: 'docFolder' | 'orgUnit',
  value: string,
): Promise<string> {
  return s.inTenant(async (tx) =>
    table === 'docFolder'
      ? (await tx.docFolder.findFirstOrThrow({ where: { code: value } })).id
      : (await tx.orgUnit.findFirstOrThrow({ where: { code: value } })).id,
  );
}

export interface VersionBody {
  readonly title: string;
  readonly classification: string;
  readonly owner_position_id: null;
  readonly source_file_id: string;
  readonly change_summary: string;
}

export async function versionBody(s: AccessScenario, person: Person): Promise<VersionBody> {
  return {
    title: 'Procedimiento del recorrido',
    classification: 'internal',
    owner_position_id: null,
    source_file_id: await pdf(s, person.session),
    change_summary: 'Recorrido de auditoría',
  };
}

let requestNumber = Math.floor(Math.random() * 1_000_000);

/** Solicitud aprobada por otra persona, escrita en la base: el recorrido no prueba la solicitud. */
export async function approvedRequest(
  s: AccessScenario,
  requester: Person,
  target: { action: 'create' | 'update' | 'obsolete'; documentId?: string },
): Promise<string> {
  requestNumber += 1;
  const processId = target.action === 'create' ? await code(s, 'orgUnit', 'SGC') : null;
  return s.inTenant(async (tx) => {
    const row = await tx.docChangeRequest.create({
      data: {
        tenantId: s.tenant.id,
        code: `SAD-2026-${String(requestNumber).padStart(7, '0')}`,
        action: target.action,
        documentId: target.documentId ?? null,
        docType: target.action === 'create' ? 'PR' : null,
        processId,
        title: 'Solicitud del recorrido',
        justification: 'Solicitud aprobada para el recorrido.',
        status: 'approved',
        requestedBy: requester.id,
        decidedBy: uuidv7(),
        decidedAt: new Date(),
      },
    });
    return row.id;
  });
}

export async function documentBody(
  s: AccessScenario,
  person: Person,
): Promise<Record<string, unknown>> {
  await seeded(s);
  return {
    folder_id: await code(s, 'docFolder', 'SGC-SGC'),
    doc_type: 'PR',
    is_controlled: true,
    process_id: await code(s, 'orgUnit', 'SGC'),
    change_request_id: await approvedRequest(s, person, { action: 'create' }),
    ...(await versionBody(s, person)),
  };
}

export async function newDocument(s: AccessScenario, person: Person): Promise<string> {
  return created(s.post('/v1/documents', person.session, await documentBody(s, person)));
}

export async function latest(
  s: AccessScenario,
  person: Person,
  documentId: string,
): Promise<Version> {
  const response = await s.get(`/v1/documents/${documentId}/versions`, person.session);
  const [version] = versionListResponseSchema.parse(response.body).data;
  if (version === undefined) throw new Error('Sin versiones.');
  return version;
}

export function step(
  s: AccessScenario,
  person: Person,
  version: Version,
  action: string,
  body = {},
): request.Test {
  return s
    .post(`/v1/versions/${version.id}/actions/${action}`, person.session, body)
    .set('If-Match', `"${String(version.version)}"`);
}

/** Pasos del trámite (B19): enviar, revisar (Calidad), aprobar (Dirección) y publicar. */
export type FlowStep = 'submit' | 'review' | 'approve' | 'publish';

export interface Cast {
  readonly author: Person;
  readonly approver: Person;
  readonly director: Person;
}

function actorOf(cast: Cast, flowStep: FlowStep): { person: Person; action: string } {
  if (flowStep === 'submit') return { person: cast.author, action: 'submit' };
  if (flowStep === 'review') return { person: cast.approver, action: 'approve' };
  if (flowStep === 'approve') return { person: cast.director, action: 'approve' };
  return { person: cast.approver, action: 'publish' };
}

export interface VersionAt extends Cast {
  readonly id: string;
  readonly version: Version;
}

/** Documento con su versión llevada por el trámite hasta el paso pedido. */
export async function versionAt(s: AccessScenario, steps: readonly FlowStep[]): Promise<VersionAt> {
  const cast = {
    author: await quality(s, 'elabora-recorrido'),
    approver: await quality(s, 'aprueba-recorrido'),
    director: await s.person('direccion-recorrido', ['DIRECCION']),
  };
  const id = await newDocument(s, cast.author);
  for (const flowStep of steps) {
    const { person, action } = actorOf(cast, flowStep);
    const response = await step(s, person, await latest(s, person, id), action);
    expect(response.status, response.text).toBe(204);
  }
  return { ...cast, id, version: await latest(s, cast.approver, id) };
}

import { createdResponseSchema } from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import { seedCore } from '../../../../src/modules/core/index.js';
import { seedNotificationTemplates } from '../../../../src/modules/ntf/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { WEB_ORIGIN, freshIp, type SignedIn } from '../../iam/support/iam-fixtures.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { organizationBody } from '../../party/support/party-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';

// Llamadas del recorrido de escrituras (B11) para las rutas de avisos, comentarios y adjuntos
// (B16). Lo que cada llamada necesita se prepara en la base o por la API.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

function withSession(test: request.Test, session: SignedIn): request.Test {
  return test
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Cookie', session.cookie)
    .set('X-CSRF-Token', session.session.csrf_token);
}

function put(s: AccessScenario, path: string, session: SignedIn, body: object): request.Test {
  return withSession(request(s.app.getHttpServer()).put(path), session).send(body);
}

function del(s: AccessScenario, path: string, session: SignedIn): request.Test {
  return withSession(request(s.app.getHttpServer()).delete(path), session);
}

/** Un aviso sin leer de la persona, guardado directamente. */
async function notice(s: AccessScenario, person: Person): Promise<string> {
  const row = await s.inTenant((tx) =>
    tx.notification.create({
      data: {
        tenantId: s.tenant.id,
        userId: person.id,
        eventId: crypto.randomUUID(),
        kind: 'task_assigned',
        title: 'Nueva tarea',
        body: 'Le asignaron una tarea.',
        deliverAt: new Date('2026-01-05T13:00:00Z'),
      },
    }),
  );
  return row.id;
}

/** Tercero creado por una persona de finanzas, que puede comentarlo y adjuntarle archivos. */
async function party(s: AccessScenario) {
  await seedCore(apiDatabase(), [s.tenant.id], systemClock);
  const owner = await s.person('finanzas-avisos-recorrido', ['ADMIN_FINANCIERO']);
  const response = await s.post('/v1/parties', owner.session, organizationBody());
  const id = createdResponseSchema.parse(response.body).id;
  return { owner, ref: { entity_type: 'party', entity_id: id } };
}

async function created(test: request.Test): Promise<string> {
  const response = await test;
  expect(response.status, response.text).toBe(201);
  return createdResponseSchema.parse(response.body).id;
}

/** Archivo disponible subido por la persona, guardado directamente. */
async function availableFile(s: AccessScenario, person: Person): Promise<string> {
  const file = await s.db.withTenant({ tenantId: s.tenant.id, userId: person.id }, (tx) =>
    tx.file.create({
      data: {
        tenantId: s.tenant.id,
        storageKey: `${s.tenant.id}/${crypto.randomUUID()}`,
        fileName: 'acta.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        scanStatus: 'available',
        sha256: '0'.repeat(64),
        scannedAt: new Date(),
      },
    }),
  );
  return file.id;
}

async function attachment(s: AccessScenario) {
  const { owner, ref } = await party(s);
  const fileId = await availableFile(s, owner);
  const body = { ...ref, file_id: fileId, label: 'Acta' };
  return { owner, id: await created(s.post('/v1/attachments', owner.session, body)) };
}

async function collaborator(s: AccessScenario): Promise<Person> {
  return s.person('colaborador-avisos-recorrido', ['COLABORADOR']);
}

export const NTF_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/me/notifications/{id}/read': async (s) => {
    const person = await collaborator(s);
    const id = await notice(s, person);
    return { test: s.post(`/v1/me/notifications/${id}/read`, person.session) };
  },
  'POST /v1/me/notifications/read-all': async (s) => {
    const person = await collaborator(s);
    await notice(s, person);
    return { test: s.post('/v1/me/notifications/read-all', person.session) };
  },
  'PUT /v1/me/notification-preferences': async (s) => {
    const person = await collaborator(s);
    const body = { items: [{ kind: 'comment_mention', email: false }] };
    return { test: put(s, '/v1/me/notification-preferences', person.session, body) };
  },
  'PATCH /v1/notification-templates/{kind}': async (s) => {
    await seedNotificationTemplates(apiDatabase(), [s.tenant.id], systemClock);
    const admin = await s.person('admin-plantillas-recorrido', ['ADMIN_PLATAFORMA']);
    const version = await s.inTenant((tx) =>
      tx.notificationTemplate.count({ where: { key: 'task_escalated' } }),
    );
    const body = { subject: 'Tarea vencida: {{tarea}}', body: 'Venció: {{tarea}}.', urgent: false };
    return {
      test: s.patch('/v1/notification-templates/task_escalated', admin.session, body, version),
    };
  },
  'POST /v1/comments': async (s) => {
    const { owner, ref } = await party(s);
    return { test: s.post('/v1/comments', owner.session, { ...ref, body: 'Recorrido' }) };
  },
  'DELETE /v1/comments/{id}': async (s) => {
    const { owner, ref } = await party(s);
    const id = await created(s.post('/v1/comments', owner.session, { ...ref, body: 'Recorrido' }));
    return { test: del(s, `/v1/comments/${id}`, owner.session) };
  },
  'POST /v1/attachments': async (s) => {
    const { owner, ref } = await party(s);
    const body = { ...ref, file_id: await availableFile(s, owner), label: 'Acta' };
    return { test: s.post('/v1/attachments', owner.session, body) };
  },
  'DELETE /v1/attachments/{id}': async (s) => {
    const { owner, id } = await attachment(s);
    return { test: del(s, `/v1/attachments/${id}`, owner.session) };
  },
  'POST /v1/attachments/{id}/download-link': async (s) => {
    const { owner, id } = await attachment(s);
    return { test: s.post(`/v1/attachments/${id}/download-link`, owner.session) };
  },
};

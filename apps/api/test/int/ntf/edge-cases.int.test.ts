import {
  NOTIFICATION_KIND_KEYS,
  createdResponseSchema,
  notificationTemplateListSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { seedNotificationTemplates } from '../../../src/modules/ntf/index.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { apiDatabase } from '../support/integration-database.js';
import { NtfScenario } from './support/ntf-scenario.js';

// Casos de borde de los avisos, comentarios y plantillas (B16): lo que pasa cuando no hay nada que
// cambiar, cuando dos personas guardan a la vez o cuando el registro desaparece.

const scenario = new NtfScenario('avisos bordes');

/** Martes 13 de octubre de 2026, 9:30 a. m. en Bogotá: dentro de la jornada. */
const WORKDAY = new Date('2026-10-13T14:30:00Z');

describe('comentarios que ya no están', () => {
  it('un comentario retirado antes de publicarse no produce aviso', async () => {
    const { ref, owner } = await scenario.party();
    const mentioned = await scenario.people('mencionado-retirado', ['COLABORADOR']);
    const response = await scenario.post('/v1/comments', owner.session, {
      ...ref,
      body: 'Me equivoqué de persona',
      mention_emails: [mentioned.email],
    });
    const id = createdResponseSchema.parse(response.body).id;
    expect((await scenario.delete(`/v1/comments/${id}`, owner.session)).status).toBe(204);
    await scenario.publishOutbox();
    const notices = await scenario.inTenant((tx) =>
      tx.notification.count({ where: { userId: mentioned.id } }),
    );
    expect(notices).toBe(0);
  });

  it('comentar un trámite que no existe responde «no existe»', async () => {
    const person = await scenario.people('sin-tramite', ['COLABORADOR']);
    const response = await scenario.post('/v1/comments', person.session, {
      entity_type: 'wf_instance',
      entity_id: crypto.randomUUID(),
      body: 'Hola',
    });
    expect(errorCode(response)).toBe('NTF_RECORD_NOT_FOUND');
  });
});

describe('alertas sin nombre conocido', () => {
  it('una alerta de un tipo nuevo llega con un texto general', async () => {
    const admin = await scenario.people('admin-alerta-nueva', ['ADMIN_PLATAFORMA']);
    const eventId = await scenario.event('security.alert', { type: 'otra.cosa' }, WORKDAY);
    await scenario.publishOutbox();
    const notice = await scenario.inTenant((tx) =>
      tx.notification.findFirstOrThrow({ where: { eventId, userId: admin.id } }),
    );
    expect(notice.title).toContain('un evento de seguridad');
  });
});

describe('sin nada que cambiar', () => {
  it('marcar todo como leído sin avisos, o guardar las mismas preferencias, no audita nada', async () => {
    const person = await scenario.people('nada-que-cambiar', ['COLABORADOR']);
    expect((await scenario.post('/v1/me/notifications/read-all', person.session)).status).toBe(204);
    const same = { items: [{ kind: 'task_assigned', email: true }] };
    const saved = await scenario.put('/v1/me/notification-preferences', person.session, same);
    expect(saved.status, saved.text).toBe(200);
    const actions = await scenario.actionsBy(person);
    expect(actions.filter((action) => action.startsWith('ntf.'))).toEqual([]);
  });

  it('cargar las plantillas otra vez no crea versiones nuevas', async () => {
    const tenants = [scenario.tenant.id];
    await seedNotificationTemplates(apiDatabase(), tenants, scenario.clock);
    const versions = await scenario.inTenant((tx) => tx.notificationTemplate.count());
    // Una sola versión por tipo de aviso: la que creó la semilla la primera vez.
    expect(versions).toBe(NOTIFICATION_KIND_KEYS.length);
  });
});

describe('dos personas guardan la misma plantilla a la vez', () => {
  it('una guarda la versión nueva y la otra debe recargar', async () => {
    const admin = await scenario.admin();
    const list = await scenario.get('/v1/notification-templates', admin.session);
    const current = notificationTemplateListSchema
      .parse(list.body)
      .items.find((item) => item.kind === 'comment_mention');
    const body = { subject: 'Mención: {{autor}}', body: 'Lo mencionó {{autor}}.', urgent: false };
    const path = '/v1/notification-templates/comment_mention';
    const results = await Promise.all([
      scenario.patch(path, admin.session, body, current?.version),
      scenario.patch(path, admin.session, body, current?.version),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
  });
});

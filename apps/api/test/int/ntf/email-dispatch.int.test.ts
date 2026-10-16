import { describe, expect, it } from 'vitest';

import {
  sendTenantNoticeEmails,
  type NoticeEmail,
} from '../../../src/modules/ntf/application/email-dispatch.js';
import { apiDatabase } from '../support/integration-database.js';
import { NtfScenario } from './support/ntf-scenario.js';

// Envío de los correos de los avisos (B16): a su hora, con reintentos y sin enviar dos veces.

const scenario = new NtfScenario('correos de avisos');

/** Martes 13 de octubre de 2026, 9:30 a. m. en Bogotá: dentro de la jornada. */
const WORKDAY = new Date('2026-10-13T14:30:00Z');
/** Sábado 19 de octubre de 2030: el correo espera al lunes. */
const FUTURE_SATURDAY = new Date('2030-10-19T15:00:00Z');
const MINUTE = 60_000;

function sender(fail = false) {
  const sent: NoticeEmail[] = [];
  return {
    sent,
    send: async (email: NoticeEmail): Promise<string | null> => {
      if (fail) throw new Error('Servidor de correo sin respuesta (simulado)');
      sent.push(email);
      return Promise.resolve(`<${String(sent.length)}@mailpit>`);
    },
  };
}

async function send(send: (email: NoticeEmail) => Promise<string | null>) {
  const deps = {
    database: apiDatabase(),
    clock: scenario.clock,
    appUrl: 'http://localhost:3000',
    sendNoticeEmail: send,
  };
  return sendTenantNoticeEmails(deps, scenario.tenant.id, scenario.clock.now());
}

/** Un aviso urgente con su correo pendiente; devuelve el envío. */
async function pendingEmail(occurredAt = WORKDAY) {
  const admin = await scenario.people('admin-correo', ['ADMIN_PLATAFORMA']);
  const eventId = await scenario.event('security.alert', { type: 'iam.mfa.reset' }, occurredAt);
  await scenario.publishOutbox();
  const delivery = await scenario.inTenant((tx) =>
    tx.notificationDelivery.findFirstOrThrow({
      where: { notification: { eventId, userId: admin.id } },
    }),
  );
  return { admin, delivery };
}

async function deliveryNow(id: string) {
  return scenario.inTenant((tx) => tx.notificationDelivery.findUniqueOrThrow({ where: { id } }));
}

describe('envío de los correos', () => {
  it('envía el correo con el enlace completo y anota el identificador del servidor', async () => {
    const { admin, delivery } = await pendingEmail();
    const mail = sender();
    expect((await send(mail.send)).sent).toBeGreaterThanOrEqual(1);
    const mine = mail.sent.find((email) => email.to === admin.email);
    expect(mine?.url).toBe('http://localhost:3000/app/auditoria/seguridad');
    expect(mine?.subject).toContain('Alerta de seguridad');
    const after = await deliveryNow(delivery.id);
    expect(after.status).toBe('sent');
    expect(after.providerMessageId).toMatch(/@mailpit>$/);
    expect(after.sentAt).not.toBeNull();
  });

  it('dos pasadas a la vez envían cada correo una sola vez', async () => {
    const { admin } = await pendingEmail();
    const mail = sender();
    await Promise.all([send(mail.send), send(mail.send)]);
    expect(mail.sent.filter((email) => email.to === admin.email)).toHaveLength(1);
  });
});

describe('reintentos', () => {
  it('si el servidor falla, reintenta con espera y al quinto intento lo da por fallido', async () => {
    const { delivery } = await pendingEmail();
    await send(sender(true).send);
    const first = await deliveryNow(delivery.id);
    expect(first).toMatchObject({ status: 'pending', attempts: 1 });
    expect(first.error).toContain('sin respuesta');
    expect(first.nextAttemptAt.getTime() - scenario.clock.now().getTime()).toBe(MINUTE);
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      scenario.clock.advance(61 * MINUTE);
      await send(sender(true).send);
    }
    expect(await deliveryNow(delivery.id)).toMatchObject({ status: 'failed', attempts: 5 });
  });
});

describe('correos diferidos', () => {
  it('un correo de un aviso diferido no se envía antes de su hora', async () => {
    const person = await scenario.people('colaborador-diferido', ['COLABORADOR']);
    const comment = await scenario.inTenant((tx) =>
      tx.comment.create({
        data: {
          tenantId: scenario.tenant.id,
          entityType: 'party',
          entityId: person.id,
          body: 'Hola',
        },
      }),
    );
    const payload = {
      comment_id: comment.id,
      author_id: person.id,
      mention_ids: [person.id],
      record_label: 'el tercero «Prueba»',
      link: '/app/terceros/x',
    };
    await scenario.event('comment.mentioned', payload, FUTURE_SATURDAY);
    await scenario.publishOutbox();
    const mail = sender();
    await send(mail.send);
    expect(mail.sent.filter((email) => email.to === person.email)).toEqual([]);
  });
});

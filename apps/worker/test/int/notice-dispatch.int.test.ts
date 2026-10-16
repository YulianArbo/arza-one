import { DatabaseService, systemClock, type TenantTransaction } from '@arza/api/platform';
import { seedNotificationTemplates } from '@arza/api/ntf';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { processNoticeDispatch } from '../../src/jobs/notice-dispatch.js';
import { SmtpMailer } from '../../src/mail/mailer.js';
import { createTenant, mailTextTo, workerConfig, type TestTenant } from './support/services.js';

// Avisos de principio a fin (B16): un evento de la bandeja de salida se convierte en un aviso en
// la aplicación y en un correo con el marco institucional que llega a Mailpit.

const config = workerConfig(9);
/** Martes 13 de octubre de 2026, 9:30 a. m. en Bogotá: dentro de la jornada. */
const WORKDAY = new Date('2026-10-13T14:30:00Z');
let fixtures: DatabaseService;
let database: DatabaseService;
let mailer: SmtpMailer;
let tenant: TestTenant;

beforeAll(async () => {
  fixtures = new DatabaseService(config.DATABASE_URL, { requireAudit: false });
  // Como el worker: exige la auditoría de cada transacción que escribe.
  database = new DatabaseService(config.DATABASE_URL);
  mailer = new SmtpMailer(config);
  tenant = await createTenant(fixtures, `Avisos ${uuidv7().slice(-6)}`);
  await seedNotificationTemplates(database, [tenant.id], systemClock);
});

afterAll(async () => {
  mailer.close();
  await Promise.all([fixtures.onModuleDestroy(), database.onModuleDestroy()]);
});

function inTenant<T>(work: (tx: TenantTransaction) => Promise<T>): Promise<T> {
  return fixtures.withTenant({ tenantId: tenant.id, userId: null }, work);
}

/** Una persona mencionada en un comentario, con el evento ya en la bandeja de salida. */
async function mention(): Promise<{ email: string; eventId: string }> {
  const email = `mencionada-${uuidv7().slice(-8)}@demo.test`;
  return inTenant(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email,
        kind: 'internal',
        status: 'active',
        displayName: 'Ana',
        // Huella ficticia: la base exige una contraseña a toda cuenta activa.
        passwordHash: '$argon2id$sin-uso',
      },
    });
    const comment = await tx.comment.create({
      data: { tenantId: tenant.id, entityType: 'party', entityId: uuidv7(), body: 'Mire esto.' },
    });
    const event = await tx.outboxEvent.create({
      data: {
        tenantId: tenant.id,
        eventType: 'comment.mentioned',
        occurredAt: WORKDAY,
        payload: {
          comment_id: comment.id,
          author_id: user.id,
          mention_ids: [user.id],
          record_label: 'el tercero «Prueba»',
          link: '/app/terceros/123',
        },
      },
    });
    return { email, eventId: event.id };
  });
}

describe('avisos de principio a fin', () => {
  it('el evento produce el aviso y el correo llega con el enlace a la aplicación', async () => {
    const { email, eventId } = await mention();
    const deps = { database, clock: systemClock, appUrl: config.APP_URL, mailer };
    const result = await processNoticeDispatch(deps);
    expect(result.events.published).toBeGreaterThanOrEqual(1);
    expect(result.emails.sent).toBeGreaterThanOrEqual(1);
    const text = await mailTextTo('lo mencionó en el tercero «Prueba»', email);
    expect(text).toContain('Mire esto.');
    expect(text).toContain('Abrir en ARZA ONE: http://localhost:3000/app/terceros/123');
    const event = await inTenant((tx) =>
      tx.outboxEvent.findUniqueOrThrow({ where: { id: eventId } }),
    );
    expect(event.publishedAt).not.toBeNull();
    const delivery = await inTenant((tx) =>
      tx.notificationDelivery.findFirstOrThrow({ where: { notification: { eventId } } }),
    );
    expect(delivery).toMatchObject({ status: 'sent', recipient: email });
    expect(delivery.providerMessageId).not.toBeNull();
  });
});

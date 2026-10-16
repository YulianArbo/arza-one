import type { NotificationDelivery } from '../../../generated/prisma/client.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import { MAX_ATTEMPTS, retryAt } from '../domain/delivery-rules.js';

// Envío de los correos de los avisos (B16). El worker toma los envíos cuya hora llegó (un aviso
// diferido, al inicio de la jornada), los reserva unos minutos, los envía y anota el resultado.
// Si se detiene durante el envío, la reserva vence y el correo se intenta de nuevo.

/** Correo listo para enviar; el worker le pone el marco institucional. */
export interface NoticeEmail {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  /** Dirección completa de la aplicación a la que lleva el aviso, si tiene. */
  readonly url: string | null;
}

export interface EmailDispatchDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
  /** Dirección de la aplicación interna (APP_URL). */
  readonly appUrl: string;
  /** Entrega el correo al servidor; devuelve el identificador que este le dio, si lo da. */
  readonly sendNoticeEmail: (email: NoticeEmail) => Promise<string | null>;
}

export interface DispatchResult {
  readonly sent: number;
  readonly failed: number;
}

/** Correos por empresa en cada pasada; los demás quedan para la siguiente. */
const BATCH = 50;
/** Reserva de un envío mientras se entrega al servidor de correo. */
const LEASE_MS = 10 * 60 * 1000;
const UNAUDITED = 'notification_delivery';

function emailOf(delivery: NotificationDelivery, appUrl: string): NoticeEmail {
  return {
    to: delivery.recipient,
    subject: delivery.subject,
    body: delivery.body,
    url: delivery.link === null ? null : new URL(delivery.link, appUrl).toString(),
  };
}

/** Reserva el envío si sigue pendiente y su hora llegó. Devuelve el envío reservado o null. */
async function claim(deps: EmailDispatchDependencies, tenantId: string, id: string, now: Date) {
  return deps.database.withTenant(
    { tenantId, userId: null },
    async (tx) => {
      const { count } = await tx.notificationDelivery.updateMany({
        where: { id, status: 'pending', nextAttemptAt: { lte: now } },
        data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
      });
      return count === 0 ? null : tx.notificationDelivery.findUniqueOrThrow({ where: { id } });
    },
    UNAUDITED,
  );
}

async function deliver(
  deps: EmailDispatchDependencies,
  delivery: NotificationDelivery,
): Promise<boolean> {
  const context = { tenantId: delivery.tenantId, userId: null };
  let providerMessageId: string | null;
  try {
    providerMessageId = await deps.sendNoticeEmail(emailOf(delivery, deps.appUrl));
  } catch (error) {
    const now = deps.clock.now();
    const exhausted = delivery.attempts >= MAX_ATTEMPTS;
    await deps.database.withTenant(
      context,
      (tx) =>
        tx.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            ...(exhausted
              ? { status: 'failed' }
              : { nextAttemptAt: retryAt(delivery.attempts, now) }),
            error: String(error instanceof Error ? error.message : error).slice(0, 300),
          },
        }),
      UNAUDITED,
    );
    return false;
  }
  await deps.database.withTenant(
    context,
    (tx) =>
      tx.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: 'sent', sentAt: deps.clock.now(), providerMessageId, error: null },
      }),
    UNAUDITED,
  );
  return true;
}

/** Envía los correos de una empresa cuya hora llegó. */
export async function sendTenantNoticeEmails(
  deps: EmailDispatchDependencies,
  tenantId: string,
  now: Date,
): Promise<DispatchResult> {
  const due = await deps.database.withTenant({ tenantId, userId: null }, (tx) =>
    tx.notificationDelivery.findMany({
      where: { status: 'pending', nextAttemptAt: { lte: now }, deletedAt: null },
      orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
      take: BATCH,
    }),
  );
  const result = { sent: 0, failed: 0 };
  for (const { id } of due) {
    const delivery = await claim(deps, tenantId, id, now);
    if (delivery === null) continue;
    if (await deliver(deps, delivery)) result.sent += 1;
    else result.failed += 1;
  }
  return result;
}

/** Envía los correos cuya hora llegó, en todas las empresas. */
export async function sendDueNoticeEmails(
  deps: EmailDispatchDependencies,
): Promise<DispatchResult> {
  const now = deps.clock.now();
  const tenants = await deps.database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT ntf_tenants_with_due_deliveries(${now}) AS id`,
  );
  const total = { sent: 0, failed: 0 };
  for (const { id } of tenants) {
    const result = await sendTenantNoticeEmails(deps, id, now);
    total.sent += result.sent;
    total.failed += result.failed;
  }
  return total;
}

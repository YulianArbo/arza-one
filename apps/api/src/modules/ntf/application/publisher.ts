import type { OutboxEvent } from '../../../generated/prisma/client.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { nextBusinessMoment } from '../../core/index.js';
import { noticeRecipients, type NoticeRecipient } from '../../iam/index.js';
import { deferredToWorkday, MAX_ATTEMPTS } from '../domain/delivery-rules.js';
import { fillTemplate } from '../domain/templates.js';
import { noticesFor, type Notice } from './event-notices.js';
import { emailDisabledKinds } from './notifications.js';
import { currentTemplates } from './templates.js';

// Publicación de la bandeja de salida (numeral 13.2, B16). Cada evento se publica en su propia
// transacción: los avisos que produce y la marca de publicado se guardan juntos o no se guarda
// nada. Si el worker se detiene a mitad de camino, el evento sigue pendiente y se publica en la
// siguiente pasada, una sola vez: ningún evento se pierde ni se duplica.

export interface PublisherDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
}

/** Cuántos eventos publica por empresa en cada pasada; los demás quedan para la siguiente. */
const BATCH = 200;

type Templates = Awaited<ReturnType<typeof currentTemplates>>;

interface Delivery {
  readonly event: OutboxEvent;
  readonly templates: Templates;
  readonly emailOff: ReadonlySet<string>;
  /** Inicio de la jornada desde el evento, calculado una sola vez y solo si hace falta. */
  readonly workday: () => Promise<Date>;
}

/** Aviso de una persona con su plantilla aplicada y su momento de entrega. */
async function renderNotice(delivery: Delivery, notice: Notice, person: NoticeRecipient) {
  const template = delivery.templates.get(notice.kind);
  if (template === undefined) return null;
  const values = { ...notice.values, nombre: person.displayName ?? person.email };
  const { urgent } = template;
  const deferred = deferredToWorkday({ urgent, collaborator: person.collaborator });
  return {
    template,
    shown: {
      title: fillTemplate(template.subject, values),
      body: fillTemplate(template.body, values),
      link: notice.link,
      deliverAt: deferred ? await delivery.workday() : delivery.event.occurredAt,
    },
  };
}

async function writeNotice(
  tx: TenantTransaction,
  delivery: Delivery,
  notice: Notice,
  person: NoticeRecipient,
): Promise<void> {
  const rendered = await renderNotice(delivery, notice, person);
  if (rendered === null) return;
  const { template, shown } = rendered;
  const { tenantId, id: eventId } = delivery.event;
  const notification = await tx.notification.create({
    data: { tenantId, userId: person.id, eventId, kind: notice.kind, ...shown },
  });
  if (!template.urgent && delivery.emailOff.has(`${person.id}:${notice.kind}`)) return;
  await tx.notificationDelivery.create({
    data: {
      tenantId,
      notificationId: notification.id,
      templateKey: template.key,
      templateVersion: template.versionNumber,
      recipient: person.email,
      subject: shown.title,
      body: shown.body,
      link: shown.link,
      deliverAt: shown.deliverAt,
      nextAttemptAt: shown.deliverAt,
    },
  });
}

async function writeNotices(tx: TenantTransaction, event: OutboxEvent, now: Date): Promise<void> {
  const notices = await noticesFor(tx, event, now);
  if (notices.length === 0) return;
  const userIds = notices.map((notice) => notice.userId);
  const [people, templates, emailOff] = await Promise.all([
    noticeRecipients(tx, userIds),
    currentTemplates(tx),
    emailDisabledKinds(tx, userIds),
  ]);
  let workday: Promise<Date> | undefined;
  const delivery: Delivery = {
    event,
    templates,
    emailOff,
    workday: async () => (workday ??= nextBusinessMoment(tx, event.occurredAt)),
  };
  const byId = new Map(people.map((person) => [person.id, person]));
  // Una persona recibe un solo aviso por evento, aunque el evento la nombre dos veces.
  const seen = new Set<string>();
  for (const notice of notices) {
    const person = byId.get(notice.userId);
    if (person === undefined || seen.has(person.id)) continue;
    seen.add(person.id);
    await writeNotice(tx, delivery, notice, person);
  }
}

/**
 * Publica un evento si sigue pendiente. El bloqueo con SKIP LOCKED evita que dos pasadas del
 * worker publiquen el mismo evento a la vez. Devuelve si lo publicó.
 */
async function publishEvent(tx: TenantTransaction, id: string, now: Date): Promise<boolean> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM core_outbox_events
    WHERE id = ${id}::uuid AND published_at IS NULL
    FOR UPDATE SKIP LOCKED`;
  if (locked.length === 0) return false;
  const event = await tx.outboxEvent.findUniqueOrThrow({ where: { id } });
  await writeNotices(tx, event, now);
  await tx.outboxEvent.update({
    where: { id },
    data: { publishedAt: now, attempts: { increment: 1 } },
  });
  return true;
}

export interface PublishResult {
  readonly published: number;
  /** Eventos que fallaron en esta pasada; quedan pendientes con un intento más. */
  readonly failed: number;
}

/** Publica los eventos pendientes de una empresa. */
export async function publishTenantEvents(
  deps: PublisherDependencies,
  tenantId: string,
  now: Date,
): Promise<PublishResult> {
  const system = { tenantId, userId: null };
  const pending = await deps.database.withTenant(system, (tx) =>
    tx.outboxEvent.findMany({
      where: { publishedAt: null, attempts: { lt: MAX_ATTEMPTS }, deletedAt: null },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
      take: BATCH,
    }),
  );
  let published = 0;
  let failed = 0;
  for (const { id } of pending) {
    try {
      const done = await deps.database.withTenant(
        system,
        (tx) => publishEvent(tx, id, now),
        'notification_delivery',
      );
      if (done) published += 1;
    } catch {
      failed += 1;
      // El evento queda pendiente con un intento más; al quinto deja de intentarse.
      await deps.database.withTenant(
        system,
        (tx) => tx.outboxEvent.update({ where: { id }, data: { attempts: { increment: 1 } } }),
        'notification_delivery',
      );
    }
  }
  return { published, failed };
}

/** Publica los eventos pendientes de todas las empresas. */
export async function publishOutboxEvents(deps: PublisherDependencies): Promise<PublishResult> {
  const now = deps.clock.now();
  const tenants = await deps.database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT ntf_tenants_with_pending_events() AS id`,
  );
  const total = { published: 0, failed: 0 };
  for (const { id } of tenants) {
    const result = await publishTenantEvents(deps, id, now);
    total.published += result.published;
    total.failed += result.failed;
  }
  return total;
}

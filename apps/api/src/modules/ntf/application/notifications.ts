import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATION_KIND_KEYS,
  NOTIFICATION_KINDS,
  notificationKindSchema,
  type Notification as NotificationView,
  type NotificationKind,
  type NotificationListResponse,
  type NotificationPreferences,
  type UpdateNotificationPreferencesRequest,
} from '@arza/contracts';

import type { Notification, Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { auditNtf } from './ntf-audit.js';
import { notificationNotFound } from './ntf-messages.js';
import { currentTemplates } from './templates.js';

// Centro de avisos y preferencias de cada persona (B16). Cada quien ve solo sus avisos, y solo
// desde el momento de su entrega: un aviso diferido no aparece antes del inicio de la jornada.

function delivered(userId: string, now: Date): Prisma.NotificationWhereInput {
  return { userId, deletedAt: null, deliverAt: { lte: now } };
}

function notificationView(row: Notification): NotificationView {
  return {
    id: row.id,
    kind: notificationKindSchema.parse(row.kind),
    title: row.title,
    body: row.body,
    link: row.link,
    delivered_at: row.deliverAt.toISOString(),
    read_at: row.readAt?.toISOString() ?? null,
  };
}

/** Tipos de aviso en los que la persona apagó el correo. */
export async function emailDisabledKinds(
  tx: TenantTransaction,
  userIds: readonly string[],
): Promise<Set<string>> {
  const rows = await tx.notificationPreference.findMany({
    where: { userId: { in: [...userIds] }, channel: 'email', enabled: false, deletedAt: null },
    select: { userId: true, eventKey: true },
  });
  return new Set(rows.map((row) => `${row.userId}:${row.eventKey}`));
}

async function saveEmailPreference(
  tx: TenantTransaction,
  principal: Principal,
  item: { readonly kind: NotificationKind; readonly email: boolean },
): Promise<void> {
  const { tenantId, userId } = principal;
  await tx.notificationPreference.upsert({
    where: {
      tenantId_userId_eventKey_channel: { tenantId, userId, eventKey: item.kind, channel: 'email' },
    },
    create: { tenantId, userId, eventKey: item.kind, enabled: item.email },
    update: { enabled: item.email },
  });
}

@Injectable()
export class NotificationsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(
    principal: Principal,
    query: { readonly unread?: boolean | undefined; readonly limit: number },
  ): Promise<NotificationListResponse> {
    const visible = delivered(principal.userId, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const [rows, unread] = await Promise.all([
        tx.notification.findMany({
          where: query.unread === true ? { ...visible, readAt: null } : visible,
          orderBy: [{ deliverAt: 'desc' }, { id: 'desc' }],
          take: query.limit,
        }),
        tx.notification.count({ where: { ...visible, readAt: null } }),
      ]);
      return { items: rows.map(notificationView), unread_count: unread };
    });
  }

  /** Marca el aviso como leído. Si ya lo estaba, no cambia nada. */
  async markRead(principal: Principal, id: string, meta: RequestMeta): Promise<void> {
    const now = this.clock.now();
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.notification.findFirst({
        where: { id, ...delivered(principal.userId, now) },
      });
      if (row === null) throw notificationNotFound();
      if (row.readAt !== null) return;
      await tx.notification.update({ where: { id }, data: { readAt: now } });
      await auditNtf(
        tx,
        { ...principal, meta, at: now },
        {
          action: 'ntf.notification.read',
          entityType: 'ntf_notification',
          entityId: id,
          changes: { read_at: now.toISOString() },
        },
      );
    });
  }

  async markAllRead(principal: Principal, meta: RequestMeta): Promise<void> {
    const now = this.clock.now();
    await this.database.withTenant(principal, async (tx) => {
      const { count } = await tx.notification.updateMany({
        where: { ...delivered(principal.userId, now), readAt: null },
        data: { readAt: now },
      });
      if (count === 0) return;
      await auditNtf(
        tx,
        { ...principal, meta, at: now },
        {
          action: 'ntf.notification.read_all',
          entityType: 'ntf_notification',
          entityId: null,
          changes: { count },
        },
      );
    });
  }

  async preferences(principal: Principal): Promise<NotificationPreferences> {
    return this.database.withTenant(principal, (tx) => this.preferencesIn(tx, principal.userId));
  }

  async updatePreferences(
    principal: Principal,
    input: UpdateNotificationPreferencesRequest,
    meta: RequestMeta,
  ): Promise<NotificationPreferences> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const before = await this.preferencesIn(tx, principal.userId);
      const changed = input.items.filter((item) =>
        before.items.some((pref) => pref.kind === item.kind && pref.email !== item.email),
      );
      if (changed.length === 0) return before;
      for (const item of changed) await saveEmailPreference(tx, principal, item);
      await auditNtf(
        tx,
        { ...principal, meta, at: now },
        {
          action: 'ntf.preference.update',
          entityType: 'ntf_preference',
          entityId: principal.userId,
          changes: Object.fromEntries(changed.map((item) => [item.kind, { email: item.email }])),
        },
      );
      return this.preferencesIn(tx, principal.userId);
    });
  }

  /** Un aviso urgente llega siempre por correo, aunque la persona lo haya apagado. */
  private async preferencesIn(
    tx: TenantTransaction,
    userId: string,
  ): Promise<NotificationPreferences> {
    const [templates, disabled] = await Promise.all([
      currentTemplates(tx),
      emailDisabledKinds(tx, [userId]),
    ]);
    return {
      items: NOTIFICATION_KIND_KEYS.map((kind) => {
        const urgent = templates.get(kind)?.urgent ?? false;
        return {
          kind,
          label: NOTIFICATION_KINDS[kind].label,
          email: urgent || !disabled.has(`${userId}:${kind}`),
          urgent,
        };
      }),
    };
  }
}

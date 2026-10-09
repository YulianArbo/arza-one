import { Inject, Injectable } from '@nestjs/common';

import type { Prisma, User } from '../../../generated/prisma/client.js';
import { recordAuditEvent, recordSecurityEvent } from '../../../platform/audit/audit-recorder.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { revokeAllSessions, revokeOtherSessions } from '../infrastructure/accounts-store.js';
import { lockUser } from '../infrastructure/assignment-store.js';
import { selfAction, userNotFound, userStateInvalid } from './access-messages.js';

interface AdminAction {
  readonly principal: Principal;
  readonly userId: string;
  readonly meta: RequestMeta;
}

/**
 * Bloqueo, desbloqueo y cierre de sesiones de otras personas desde la pantalla de usuarios
 * (ficha 17.2 y numeral 15.7). Nadie se lo hace a sí mismo. Cada acción deja auditoría; bloquear
 * y cerrar sesiones dejan además un evento de seguridad.
 */
@Injectable()
export class UserAdministration {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Bloquea la cuenta (activo → bloqueado) y cierra todas sus sesiones (iam.user.lock). */
  async lock(action: AdminAction): Promise<void> {
    await this.onOtherUser(action, async (tx, user, now) => {
      if (user.status !== 'active') throw userStateInvalid('Solo se bloquea una cuenta activa.');
      await tx.user.update({ where: { id: user.id }, data: { status: 'locked' } });
      const closed = await revokeAllSessions(tx, user.id, 'account_locked', now);
      const changes = { status: { from: 'active', to: 'locked' }, sessions_closed: closed };
      await this.audit(tx, action, { name: 'iam.user.lock', changes, now });
      await this.alert(tx, action, { type: 'iam.account.locked_by_admin', detail: changes, now });
    });
  }

  /** Desbloquea: quita el bloqueo del administrador o el de los intentos fallidos. */
  async unlock(action: AdminAction): Promise<void> {
    await this.onOtherUser(action, async (tx, user, now) => {
      const temporary = user.lockedUntil !== null && user.lockedUntil > now;
      if (user.status !== 'locked' && !temporary) {
        throw userStateInvalid('La cuenta no está bloqueada.');
      }
      const status = user.status === 'locked' ? 'active' : user.status;
      await tx.user.update({ where: { id: user.id }, data: { status, lockedUntil: null } });
      const changes = {
        status: { from: user.status, to: status },
        temporary_lock_cleared: temporary,
      };
      await this.audit(tx, action, { name: 'iam.user.unlock', changes, now });
    });
  }

  /** Cierra todas las sesiones de una persona (iam.session.revoke). */
  async revokeSessions(action: AdminAction): Promise<number> {
    return this.onOtherUser(action, async (tx, user, now) => {
      const closed = await revokeAllSessions(tx, user.id, 'remote_revoke', now);
      const changes = { sessions_closed: closed };
      await this.audit(tx, action, { name: 'iam.session.revoke_user', changes, now });
      await this.alert(tx, action, { type: 'iam.sessions.revoked', detail: changes, now });
      return closed;
    });
  }

  /**
   * Cierra todas las sesiones de la empresa salvo la de quien lo pide (numeral 15.7, respuesta a
   * incidentes). Todos tendrán que iniciar sesión de nuevo.
   */
  async revokeAllInTenant(principal: Principal, meta: RequestMeta): Promise<number> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const { count } = await tx.session.updateMany({
        where: { revokedAt: null, userId: { not: principal.userId } },
        data: { revokedAt: now, revokedReason: 'remote_revoke' },
      });
      const mine = { userId: principal.userId, keepSessionId: principal.sessionId };
      const own = await revokeOtherSessions(tx, mine, 'remote_revoke', now);
      const action = { principal, userId: principal.userId, meta };
      const changes = { sessions_closed: count + own, scope: 'tenant' };
      await this.audit(tx, action, { name: 'iam.session.revoke_all', changes, now });
      await this.alert(tx, action, { type: 'iam.sessions.revoked_all', detail: changes, now });
      return count + own;
    });
  }

  private async onOtherUser<T>(
    action: AdminAction,
    work: (tx: TenantTransaction, user: User, now: Date) => Promise<T>,
  ): Promise<T> {
    if (action.userId === action.principal.userId) throw selfAction();
    const now = this.clock.now();
    return this.database.withTenant(action.principal, async (tx) => {
      const user = await lockUser(tx, action.userId);
      if (user === null || user.kind === 'service') throw userNotFound();
      return work(tx, user, now);
    });
  }

  private async audit(
    tx: TenantTransaction,
    action: AdminAction,
    event: { readonly name: string; readonly changes: Prisma.InputJsonObject; readonly now: Date },
  ): Promise<void> {
    await recordAuditEvent(tx, {
      tenantId: action.principal.tenantId,
      occurredAt: event.now,
      actor: { kind: 'user', id: action.principal.userId },
      action: event.name,
      entityType: 'iam_user',
      entityId: action.userId,
      result: 'success',
      changes: event.changes,
      meta: action.meta,
    });
  }

  private async alert(
    tx: TenantTransaction,
    action: AdminAction,
    event: { readonly type: string; readonly detail: Prisma.InputJsonObject; readonly now: Date },
  ): Promise<void> {
    const { tenantId, userId: actorId } = action.principal;
    const detail = { ...event.detail, user_id: action.userId, actor_id: actorId };
    await recordSecurityEvent(tx, {
      tenantId,
      occurredAt: event.now,
      type: event.type,
      userId: action.userId,
      severity: 'high',
      detail,
      meta: action.meta,
    });
    await addOutboxEvent(tx, {
      tenantId,
      eventType: 'security.alert',
      actorId,
      occurredAt: event.now,
      payload: { type: event.type, user_id: action.userId },
    });
  }
}

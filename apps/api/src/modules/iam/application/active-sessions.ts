import { Inject, Injectable } from '@nestjs/common';
import type { ActiveSession } from '@arza/contracts';

import type { Session } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { describeDevice } from '../domain/device.js';
import { isIdleExpired } from '../domain/session-policy.js';
import { revokeOtherSessions } from '../infrastructure/accounts-store.js';
import { sessionNotFound } from './iam-messages.js';

/**
 * «Sesiones activas» (B09, ficha 17.2): cada persona ve dónde tiene sesión abierta y puede
 * cerrarla. Como cada petición valida la sesión contra la base de datos, el cierre surte efecto en
 * la petición siguiente de ese otro equipo. Solo se ven y cierran las sesiones propias: la de otra
 * persona, o de otra empresa, responde 404.
 */
@Injectable()
export class ActiveSessionsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<ActiveSession[]> {
    const now = this.clock.now();
    const sessions = await this.database.withTenant(principal, (tx) =>
      tx.session.findMany({
        where: { userId: principal.userId, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { lastSeenAt: 'desc' },
      }),
    );
    return sessions
      .filter((session) => !isIdleExpired(session.lastSeenAt, now))
      .map((session) => this.viewOf(session, principal));
  }

  async revoke(principal: Principal, sessionId: string, meta: RequestMeta): Promise<void> {
    const now = this.clock.now();
    await this.database.withTenant(principal, async (tx) => {
      const { count } = await tx.session.updateMany({
        where: { id: sessionId, userId: principal.userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'remote_revoke' },
      });
      if (count === 0) throw sessionNotFound();
      await recordAuditEvent(tx, {
        tenantId: principal.tenantId,
        occurredAt: now,
        actor: { kind: 'user', id: principal.userId },
        action: 'iam.session.revoke',
        entityType: 'iam_session',
        entityId: sessionId,
        result: 'success',
        changes: { reason: 'remote_revoke', from_session_id: principal.sessionId },
        meta,
      });
    });
  }

  /** Cierra todas las demás sesiones y deja la actual. Devuelve cuántas cerró. */
  async revokeOthers(principal: Principal, meta: RequestMeta): Promise<number> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const owner = { userId: principal.userId, keepSessionId: principal.sessionId };
      const closed = await revokeOtherSessions(tx, owner, 'remote_revoke', now);
      await recordAuditEvent(tx, {
        tenantId: principal.tenantId,
        occurredAt: now,
        actor: { kind: 'user', id: principal.userId },
        action: 'iam.session.revoke_others',
        entityType: 'iam_user',
        entityId: principal.userId,
        result: 'success',
        changes: { sessions_closed: closed, kept_session_id: principal.sessionId },
        meta,
      });
      return closed;
    });
  }

  private viewOf(session: Session, principal: Principal): ActiveSession {
    const { browser, os } = describeDevice(session.userAgent);
    return {
      id: session.id,
      created_at: session.createdAt.toISOString(),
      last_seen_at: session.lastSeenAt.toISOString(),
      ip: session.ip,
      browser,
      os,
      current: session.id === principal.sessionId,
      pending_second_factor: session.authenticatedAt === null,
    };
  }
}

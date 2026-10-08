import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import type { Session, User } from '../../../generated/prisma/client.js';
import type { Authenticator, Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { CONFIG } from '../../../platform/config/config.module.js';
import type { Env } from '../../../platform/config/env-schema.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { isIdleExpired, shouldTouch } from '../domain/session-policy.js';
import { canSignIn } from '../domain/user.js';
import { loadUser, revokeSession } from '../infrastructure/accounts-store.js';
import { findSession, type SessionRef } from '../infrastructure/identity-lookup.js';
import { csrfTokenFor, hashSecretToken } from '../infrastructure/secret-token.js';
import { sessionTokenFrom } from './session-cookie.js';

interface SessionUserView {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly kind: 'internal' | 'portal';
}

export interface SessionView {
  readonly sessionId: string;
  readonly user: SessionUserView;
  readonly csrfToken: string;
  readonly expiresAt: Date;
}

/**
 * Valida la cookie de sesión en cada petición (numeral 13.1, paso 4) contra iam_sessions:
 * debe existir, no estar cerrada ni vencida (12 horas en total, 8 sin uso) y ser de una cuenta
 * activa. Al vencer por inactividad, la cierra.
 */
@Injectable()
export class SessionService implements Authenticator {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: Env,
  ) {}

  async authenticate(request: Request): Promise<Principal | null> {
    const token = sessionTokenFrom(request.headers.cookie);
    if (token === null) return null;
    const now = this.clock.now();
    const ref = await findSession(this.database, hashSecretToken(token), now);
    if (ref === null) return null;
    const valid = await this.database.withTenant(
      { tenantId: ref.tenantId, userId: ref.userId },
      (tx) => this.checkAndTouch(tx, ref, now),
    );
    return valid ? this.principalOf(ref) : null;
  }

  /** Datos de la sesión actual para la web, con su código antifalsificación. */
  async current(principal: Principal): Promise<SessionView> {
    return this.database.withTenant(principal, async (tx) => {
      const session = await tx.session.findUniqueOrThrow({ where: { id: principal.sessionId } });
      const user = await tx.user.findUniqueOrThrow({ where: { id: principal.userId } });
      return this.viewOf(session, user);
    });
  }

  /** Cierra la sesión actual (numeral 14.3, auth/logout). */
  async logout(principal: Principal, meta: RequestMeta): Promise<void> {
    const now = this.clock.now();
    await this.database.withTenant(principal, async (tx) => {
      await revokeSession(tx, principal.sessionId, 'logout', now);
      await recordAuditEvent(tx, {
        tenantId: principal.tenantId,
        occurredAt: now,
        actor: { kind: 'user', id: principal.userId },
        action: 'iam.session.revoke',
        entityType: 'iam_session',
        entityId: principal.sessionId,
        result: 'success',
        changes: { reason: 'logout' },
        meta,
      });
    });
  }

  viewOf(session: Session, user: User): SessionView {
    return {
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        kind: user.kind === 'portal' ? 'portal' : 'internal',
      },
      csrfToken: csrfTokenFor(session.id, this.config.CSRF_SECRET),
      expiresAt: session.expiresAt,
    };
  }

  private principalOf(ref: SessionRef): Principal {
    return {
      userId: ref.userId,
      tenantId: ref.tenantId,
      sessionId: ref.sessionId,
      csrfToken: csrfTokenFor(ref.sessionId, this.config.CSRF_SECRET),
    };
  }

  private async checkAndTouch(tx: TenantTransaction, ref: SessionRef, now: Date): Promise<boolean> {
    const session = await tx.session.findUnique({ where: { id: ref.sessionId } });
    const user = await loadUser(tx, ref.userId);
    if (session === null || user === null || !canSignIn(user)) return false;
    if (isIdleExpired(session.lastSeenAt, now)) {
      await this.expireIdle(tx, ref, now);
      return false;
    }
    if (shouldTouch(session.lastSeenAt, now)) {
      await tx.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }
    return true;
  }

  private async expireIdle(tx: TenantTransaction, ref: SessionRef, now: Date): Promise<void> {
    await revokeSession(tx, ref.sessionId, 'idle', now);
    await recordAuditEvent(tx, {
      tenantId: ref.tenantId,
      occurredAt: now,
      actor: { kind: 'system' },
      action: 'iam.session.revoke',
      entityType: 'iam_session',
      entityId: ref.sessionId,
      result: 'success',
      changes: { reason: 'idle' },
      meta: null,
    });
  }
}

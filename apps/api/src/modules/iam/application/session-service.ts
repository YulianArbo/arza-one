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
import {
  isRecentlyVerified,
  signInStage,
  type SignInStage,
} from '../domain/second-factor-policy.js';
import { isIdleExpired, shouldTouch } from '../domain/session-policy.js';
import { canSignIn } from '../domain/user.js';
import { loadUser, revokeSession } from '../infrastructure/accounts-store.js';
import { findSession, type SessionRef } from '../infrastructure/identity-lookup.js';
import { hasConfirmedFactor } from '../infrastructure/second-factor-store.js';
import { csrfTokenFor, hashSecretToken } from '../infrastructure/secret-token.js';
import { sessionTokenFrom } from './session-cookie.js';
import { TENANT_GATE, type TenantGate } from './tenant-gate.js';

interface SessionUserView {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly kind: 'internal' | 'portal';
}

export interface SessionView {
  readonly sessionId: string;
  readonly user: SessionUserView;
  readonly stage: SignInStage;
  readonly csrfToken: string;
  readonly expiresAt: Date;
  /** Faltan por aceptar los términos de la plataforma vigentes (B41). */
  readonly termsPending: boolean;
}

/**
 * Valida la cookie de sesión en cada petición (numeral 13.1, paso 4) contra iam_sessions:
 * debe existir, no estar cerrada ni vencida (12 horas en total, 8 sin uso) y ser de una cuenta
 * activa de una empresa activa (B48). Al vencer por inactividad, la cierra. Como se consulta en cada petición, una sesión
 * cerrada desde otro dispositivo deja de servir en la petición siguiente (B09). Informa además si
 * la sesión ya pasó el segundo factor y si la identidad se confirmó en los últimos 30 minutos.
 */
@Injectable()
export class SessionService implements Authenticator {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIG) private readonly config: Env,
    @Inject(TENANT_GATE) private readonly gate: TenantGate,
  ) {}

  async authenticate(request: Request): Promise<Principal | null> {
    const token = sessionTokenFrom(request.headers.cookie);
    if (token === null) return null;
    const now = this.clock.now();
    const ref = await findSession(this.database, hashSecretToken(token), now);
    if (ref === null) return null;
    const session = await this.database.withTenant(
      { tenantId: ref.tenantId, userId: ref.userId },
      (tx) => this.checkAndTouch(tx, ref, now),
      'session_activity',
    );
    return session === null ? null : this.principalOf(ref, session, now);
  }

  /** Datos de la sesión actual para la web, con su código antifalsificación. */
  async current(principal: Principal): Promise<SessionView> {
    return this.database.withTenant(principal, async (tx) => {
      const session = await tx.session.findUniqueOrThrow({ where: { id: principal.sessionId } });
      const user = await tx.user.findUniqueOrThrow({ where: { id: principal.userId } });
      const stage = signInStage(session.authenticatedAt, await hasConfirmedFactor(tx, user.id));
      return this.viewOf(session, user, stage);
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

  viewOf(session: Session, user: User, stage: SignInStage): SessionView {
    return {
      sessionId: session.id,
      stage,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        kind: user.kind === 'portal' ? 'portal' : 'internal',
      },
      csrfToken: csrfTokenFor(session.id, this.config.CSRF_SECRET),
      expiresAt: session.expiresAt,
      termsPending: session.termsPending,
    };
  }

  private principalOf(ref: SessionRef, session: Session, now: Date): Principal {
    return {
      userId: ref.userId,
      tenantId: ref.tenantId,
      sessionId: ref.sessionId,
      csrfToken: csrfTokenFor(ref.sessionId, this.config.CSRF_SECRET),
      signInComplete: session.authenticatedAt !== null,
      recentlyVerified: isRecentlyVerified(session.reauthenticatedAt, now),
      termsPending: session.termsPending,
    };
  }

  private async checkAndTouch(
    tx: TenantTransaction,
    ref: SessionRef,
    now: Date,
  ): Promise<Session | null> {
    const session = await tx.session.findUnique({ where: { id: ref.sessionId } });
    const user = await loadUser(tx, ref.userId);
    if (session === null || user === null || !canSignIn(user)) return null;
    // Una empresa suspendida pierde el acceso en la petición siguiente (B48).
    if (!(await this.gate.isOpen(tx))) return null;
    if (isIdleExpired(session.lastSeenAt, now)) {
      await this.expireIdle(tx, ref, now);
      return null;
    }
    if (shouldTouch(session.lastSeenAt, now)) {
      await tx.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }
    return session;
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

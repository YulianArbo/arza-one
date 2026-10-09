import { Inject, Injectable } from '@nestjs/common';
import type { SecondFactorConfirmRequest } from '@arza/contracts';

import type { MfaFactor, Session, User } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent, recordSecurityEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { LOCK_DURATION_MS } from '../domain/login-throttle.js';
import { isRecentlyVerified, setupExpiresAt } from '../domain/second-factor-policy.js';
import { loadUser, revokeOtherSessions } from '../infrastructure/accounts-store.js';
import {
  confirmPendingSecret,
  isConfirmed,
  loadFactor,
  storePendingSecret,
} from '../infrastructure/second-factor-store.js';
import { newTotpSecret, totpUri } from '../infrastructure/totp.js';
import { AccountNotifier } from './account-notifier.js';
import {
  accountLocked,
  secondFactorAlreadyConfigured,
  secondFactorCodeInvalid,
  secondFactorNotConfigured,
  reauthenticationRequired,
  secondFactorSetupExpired,
} from './iam-messages.js';
import { SecondFactorVerifier } from './second-factor-verifier.js';
import { SessionService, type SessionView } from './session-service.js';
import { SignInCompletion, type Completion } from './sign-in-completion.js';
import { VerificationFailures } from './verification-failures.js';

export interface StartedSetup {
  readonly secret: string;
  readonly otpauthUri: string;
  readonly expiresAt: Date;
}

export interface ConfirmedSetup {
  readonly recoveryCodes: readonly string[];
  readonly view: SessionView;
  /** Llave nueva si la configuración completó el inicio de sesión. */
  readonly sessionToken: string | null;
  readonly deviceToken: string | null;
}

interface Context {
  readonly session: Session;
  readonly user: User;
  readonly factor: MfaFactor | null;
}

type Outcome =
  | { readonly kind: 'failed'; readonly locked: boolean }
  | {
      readonly kind: 'confirmed';
      readonly context: Context;
      readonly replaced: boolean;
      readonly recoveryCodes: readonly string[];
      readonly completion: Completion | null;
    };

/**
 * Configuración del segundo factor (B09): la API crea un secreto, la persona lo agrega a su
 * aplicación con el código QR y confirma con el primer código; entonces recibe sus diez códigos
 * de recuperación. Se configura:
 * - al iniciar sesión, si su cuenta lo exige y aún no lo tiene (no pasa de esa pantalla), o
 * - desde «Mi perfil», con la identidad confirmada en los últimos 30 minutos: para activarlo si
 *   es opcional o para pasarlo a otro celular. El anterior deja de servir y se cierran las demás
 *   sesiones.
 */
@Injectable()
export class SecondFactorSetupUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SecondFactorVerifier) private readonly verifier: SecondFactorVerifier,
    @Inject(VerificationFailures) private readonly failures: VerificationFailures,
    @Inject(SignInCompletion) private readonly completion: SignInCompletion,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AccountNotifier) private readonly notifier: AccountNotifier,
  ) {}

  async start(principal: Principal, meta: RequestMeta): Promise<StartedSetup> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const { user } = await this.authorizedContext(tx, principal, now);
      const secret = newTotpSecret();
      const expiresAt = setupExpiresAt(now);
      const factor = await storePendingSecret(tx, {
        tenantId: user.tenantId,
        userId: user.id,
        encrypted: this.verifier.encryptSecret(secret, {
          tenantId: user.tenantId,
          userId: user.id,
        }),
        expiresAt,
      });
      await recordAuditEvent(tx, {
        tenantId: user.tenantId,
        occurredAt: now,
        actor: { kind: 'user', id: user.id },
        action: 'iam.mfa.setup_start',
        entityType: 'iam_mfa_factor',
        entityId: factor.id,
        result: 'success',
        changes: { expires_at: expiresAt.toISOString() },
        meta,
      });
      return { secret, otpauthUri: totpUri(secret, user.email), expiresAt };
    });
  }

  async confirm(
    principal: Principal,
    input: SecondFactorConfirmRequest,
    meta: RequestMeta,
    deviceToken: string | null,
  ): Promise<ConfirmedSetup> {
    const now = this.clock.now();
    const outcome = await this.database.withTenant(principal, (tx) =>
      this.confirmIn(tx, principal, { code: input.code, meta, now, deviceToken }),
    );
    if (outcome.kind === 'failed') {
      throw outcome.locked ? accountLocked(LOCK_DURATION_MS / 1000) : secondFactorCodeInvalid();
    }
    const { context, completion } = outcome;
    if (completion !== null) await this.completion.notify(completion, meta, now);
    await this.notifier.request({
      tenantId: principal.tenantId,
      actorId: principal.userId,
      accountUserId: principal.userId,
      purpose: outcome.replaced ? 'mfa_changed' : 'mfa_enabled',
      correlationId: meta.correlationId,
      occurredAt: now,
    });
    return {
      recoveryCodes: outcome.recoveryCodes,
      view: this.sessions.viewOf(completion?.session ?? context.session, context.user, 'complete'),
      sessionToken: completion?.sessionToken ?? null,
      deviceToken: completion?.deviceToken ?? null,
    };
  }

  /**
   * Quién puede configurar: una sesión a medias de una cuenta sin segundo factor, o una sesión
   * completa que confirmó su identidad hace menos de 30 minutos.
   */
  private async authorizedContext(
    tx: TenantTransaction,
    principal: Principal,
    now: Date,
  ): Promise<Context> {
    const session = await tx.session.findUniqueOrThrow({ where: { id: principal.sessionId } });
    const user = await loadUser(tx, principal.userId);
    if (user === null) throw secondFactorNotConfigured();
    const factor = await loadFactor(tx, user.id);
    if (session.authenticatedAt === null) {
      if (isConfirmed(factor)) throw secondFactorAlreadyConfigured();
    } else if (!isRecentlyVerified(session.reauthenticatedAt, now)) {
      throw reauthenticationRequired();
    }
    return { session, user, factor };
  }

  private async confirmIn(
    tx: TenantTransaction,
    principal: Principal,
    input: {
      readonly code: string;
      readonly meta: RequestMeta;
      readonly now: Date;
      readonly deviceToken: string | null;
    },
  ): Promise<Outcome> {
    const { meta, now } = input;
    const context = await this.authorizedContext(tx, principal, now);
    const { session, user, factor } = context;
    const pending = factor?.pendingSecretEncrypted ?? null;
    if (factor === null || pending === null || (factor.pendingExpiresAt ?? now) <= now) {
      throw secondFactorSetupExpired();
    }
    const step = this.verifier.stepFor(pending, factor, input.code, now);
    if (step === null) {
      const locked = await this.failures.register(tx, {
        session,
        action: 'iam.mfa.setup_confirm',
        meta,
        now,
      });
      return { kind: 'failed', locked };
    }
    const replaced = isConfirmed(factor);
    await confirmPendingSecret(tx, factor, step, now);
    const recoveryCodes = await this.verifier.issueRecoveryCodes(tx, factor, now);
    const completion = await this.finishSignIn(tx, context, input);
    // Pasar a otro celular invalida el anterior: las demás sesiones se cierran.
    const owner = { userId: user.id, keepSessionId: session.id };
    const closed = replaced ? await revokeOtherSessions(tx, owner, 'mfa_changed', now) : 0;
    await this.record(tx, { factor, replaced, closed, meta, now });
    return { kind: 'confirmed', context, replaced, recoveryCodes, completion };
  }

  /** Si la configuración se hizo al iniciar sesión, la sesión queda completa. */
  private async finishSignIn(
    tx: TenantTransaction,
    { session, user }: Context,
    input: { readonly meta: RequestMeta; readonly now: Date; readonly deviceToken: string | null },
  ): Promise<Completion | null> {
    if (session.authenticatedAt !== null) return null;
    return this.completion.complete(tx, { session, user, rotate: true, ...input });
  }

  private async record(
    tx: TenantTransaction,
    input: {
      readonly factor: MfaFactor;
      readonly replaced: boolean;
      readonly closed: number;
      readonly meta: RequestMeta;
      readonly now: Date;
    },
  ): Promise<void> {
    const { factor, replaced, meta, now } = input;
    const { tenantId, userId } = factor;
    await recordAuditEvent(tx, {
      tenantId,
      occurredAt: now,
      actor: { kind: 'user', id: userId },
      action: replaced ? 'iam.mfa.change' : 'iam.mfa.enable',
      entityType: 'iam_mfa_factor',
      entityId: factor.id,
      result: 'success',
      changes: { type: factor.type, sessions_closed: input.closed },
      meta,
    });
    await this.alert(tx, factor, replaced, input.closed, meta, now);
  }

  /** Activarlo es un evento menor; pasarlo a otro celular, uno medio con alerta (B16). */
  private async alert(
    tx: TenantTransaction,
    factor: MfaFactor,
    replaced: boolean,
    closed: number,
    meta: RequestMeta,
    now: Date,
  ): Promise<void> {
    const { tenantId, userId } = factor;
    const type = replaced ? 'iam.mfa.changed' : 'iam.mfa.enabled';
    await recordSecurityEvent(tx, {
      tenantId,
      occurredAt: now,
      type,
      userId,
      severity: replaced ? 'medium' : 'low',
      detail: { sessions_closed: closed },
      meta,
    });
    if (!replaced) return;
    await addOutboxEvent(tx, {
      tenantId,
      eventType: 'security.alert',
      actorId: userId,
      occurredAt: now,
      payload: { type, user_id: userId },
    });
  }
}

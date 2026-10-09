import { Inject, Injectable } from '@nestjs/common';
import type { SecondFactorRequest } from '@arza/contracts';

import type { Session, User } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent, recordSecurityEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { LOCK_DURATION_MS } from '../domain/login-throttle.js';
import { loadUser } from '../infrastructure/accounts-store.js';
import {
  isConfirmed,
  loadFactor,
  remainingRecoveryCodes,
} from '../infrastructure/second-factor-store.js';
import { AccountNotifier } from './account-notifier.js';
import {
  accountLocked,
  secondFactorCodeInvalid,
  secondFactorNotConfigured,
  signInAlreadyComplete,
} from './iam-messages.js';
import type { StartedSession } from './login.js';
import { SecondFactorVerifier, type VerificationMethod } from './second-factor-verifier.js';
import { SessionService } from './session-service.js';
import { SignInCompletion, type Completion } from './sign-in-completion.js';
import { VerificationFailures } from './verification-failures.js';

type Outcome =
  | { readonly kind: 'failed'; readonly locked: boolean }
  | {
      readonly kind: 'verified';
      readonly user: User;
      readonly completion: Completion;
      readonly method: VerificationMethod;
    };

/**
 * Segundo paso del inicio de sesión (numeral 15.1, B09): el código de la aplicación del celular o
 * uno de los diez códigos de recuperación. Al acertar, la sesión se completa con una llave nueva.
 * Cinco códigos equivocados cierran la sesión y bloquean la cuenta 15 minutos.
 */
@Injectable()
export class SecondFactorSignInUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SecondFactorVerifier) private readonly verifier: SecondFactorVerifier,
    @Inject(VerificationFailures) private readonly failures: VerificationFailures,
    @Inject(SignInCompletion) private readonly completion: SignInCompletion,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AccountNotifier) private readonly notifier: AccountNotifier,
  ) {}

  async execute(
    principal: Principal,
    proof: SecondFactorRequest,
    meta: RequestMeta,
    deviceToken: string | null,
  ): Promise<StartedSession> {
    const now = this.clock.now();
    const outcome = await this.database.withTenant(principal, (tx) =>
      this.verify(tx, principal, { proof, meta, now, deviceToken }),
    );
    if (outcome.kind === 'failed') {
      throw outcome.locked ? accountLocked(LOCK_DURATION_MS / 1000) : secondFactorCodeInvalid();
    }
    await this.completion.notify(outcome.completion, meta, now);
    if (outcome.method === 'recovery_code') {
      await this.notifier.request({
        tenantId: principal.tenantId,
        actorId: principal.userId,
        accountUserId: principal.userId,
        purpose: 'recovery_code_used',
        correlationId: meta.correlationId,
        occurredAt: now,
      });
    }
    return {
      token: outcome.completion.sessionToken ?? '',
      deviceToken: outcome.completion.deviceToken,
      view: this.sessions.viewOf(outcome.completion.session, outcome.user, 'complete'),
    };
  }

  private async verify(
    tx: TenantTransaction,
    principal: Principal,
    input: {
      readonly proof: SecondFactorRequest;
      readonly meta: RequestMeta;
      readonly now: Date;
      readonly deviceToken: string | null;
    },
  ): Promise<Outcome> {
    const { meta, now } = input;
    const session = await tx.session.findUniqueOrThrow({ where: { id: principal.sessionId } });
    const user = await loadUser(tx, principal.userId);
    if (user === null) throw secondFactorNotConfigured();
    if (session.authenticatedAt !== null) throw signInAlreadyComplete();
    const factor = await loadFactor(tx, user.id);
    if (!isConfirmed(factor)) throw secondFactorNotConfigured();
    const method = await this.verifier.verify(tx, factor, input.proof, now);
    if (method === null) {
      const locked = await this.failures.register(tx, {
        session,
        action: 'iam.mfa.verify',
        meta,
        now,
      });
      return { kind: 'failed', locked };
    }
    const completion = await this.completion.complete(tx, {
      session,
      user,
      deviceToken: input.deviceToken,
      rotate: true,
      meta,
      now,
    });
    await this.recordSuccess(tx, session, method, meta, now);
    return { kind: 'verified', user, completion, method };
  }

  private async recordSuccess(
    tx: TenantTransaction,
    session: Session,
    method: VerificationMethod,
    meta: RequestMeta,
    now: Date,
  ): Promise<void> {
    await recordAuditEvent(tx, {
      tenantId: session.tenantId,
      occurredAt: now,
      actor: { kind: 'user', id: session.userId },
      action: 'iam.mfa.verify',
      entityType: 'iam_session',
      entityId: session.id,
      result: 'success',
      changes: { method },
      meta,
    });
    if (method !== 'recovery_code') return;
    await recordSecurityEvent(tx, {
      tenantId: session.tenantId,
      occurredAt: now,
      type: 'iam.mfa.recovery_code_used',
      userId: session.userId,
      severity: 'medium',
      detail: { remaining: await remainingRecoveryCodes(tx, session.userId) },
      meta,
    });
  }
}

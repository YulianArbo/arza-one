import { Inject, Injectable } from '@nestjs/common';
import type { ReauthenticateRequest, SecondFactorRequest } from '@arza/contracts';

import type { MfaFactor, Session } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent, recordSecurityEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { LOCK_DURATION_MS } from '../domain/login-throttle.js';
import { loadUser } from '../infrastructure/accounts-store.js';
import { verifyPassword } from '../infrastructure/password-hasher.js';
import {
  isConfirmed,
  loadFactor,
  remainingRecoveryCodes,
} from '../infrastructure/second-factor-store.js';
import { AccountNotifier } from './account-notifier.js';
import { accountLocked, reauthenticationFailed } from './iam-messages.js';
import { SecondFactorVerifier, type VerificationMethod } from './second-factor-verifier.js';
import { VerificationFailures } from './verification-failures.js';

type Outcome =
  | { readonly kind: 'failed'; readonly locked: boolean }
  | { readonly kind: 'verified'; readonly method: VerificationMethod | 'password' };

function proofOf(input: ReauthenticateRequest): SecondFactorRequest | null {
  if (input.code === undefined && input.recovery_code === undefined) return null;
  return { code: input.code, recovery_code: input.recovery_code };
}

/**
 * «Confirme que es usted» (numeral 15.1): antes de una acción de alto riesgo, la persona vuelve a
 * escribir su contraseña y, si tiene segundo factor, su código. La confirmación vale 30 minutos.
 * Los fallos cuentan igual que en el segundo paso: al quinto se cierra la sesión.
 */
@Injectable()
export class ReauthenticationUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SecondFactorVerifier) private readonly verifier: SecondFactorVerifier,
    @Inject(VerificationFailures) private readonly failures: VerificationFailures,
    @Inject(AccountNotifier) private readonly notifier: AccountNotifier,
  ) {}

  async execute(
    principal: Principal,
    input: ReauthenticateRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const passwordMatches = await this.passwordMatches(principal, input.password);
    const now = this.clock.now();
    const outcome = await this.database.withTenant(principal, (tx) =>
      this.verify(tx, principal, { passwordMatches, proof: proofOf(input), meta, now }),
    );
    if (outcome.kind === 'failed') {
      throw outcome.locked ? accountLocked(LOCK_DURATION_MS / 1000) : reauthenticationFailed();
    }
    if (outcome.method !== 'recovery_code') return;
    await this.notifier.request({
      tenantId: principal.tenantId,
      actorId: principal.userId,
      accountUserId: principal.userId,
      purpose: 'recovery_code_used',
      correlationId: meta.correlationId,
      occurredAt: now,
    });
  }

  private async passwordMatches(principal: Principal, password: string): Promise<boolean> {
    const user = await this.database.withTenant(principal, (tx) => loadUser(tx, principal.userId));
    const passwordHash = user?.passwordHash ?? null;
    return passwordHash !== null && verifyPassword(password, passwordHash);
  }

  private async verify(
    tx: TenantTransaction,
    principal: Principal,
    input: {
      readonly passwordMatches: boolean;
      readonly proof: SecondFactorRequest | null;
      readonly meta: RequestMeta;
      readonly now: Date;
    },
  ): Promise<Outcome> {
    const { meta, now } = input;
    const session = await tx.session.findUniqueOrThrow({ where: { id: principal.sessionId } });
    const factor = await loadFactor(tx, principal.userId);
    // El código solo se comprueba (y se gasta) si la contraseña ya coincidió.
    const method = input.passwordMatches
      ? await this.secondFactorMethod(tx, factor, input.proof, now)
      : null;
    if (method === null) {
      const locked = await this.failures.register(tx, {
        session,
        action: 'iam.session.reauthenticate',
        meta,
        now,
      });
      return { kind: 'failed', locked };
    }
    await this.record(tx, session, method, meta, now);
    return { kind: 'verified', method };
  }

  /** Sin segundo factor basta la contraseña; con él, también el código. */
  private async secondFactorMethod(
    tx: TenantTransaction,
    factor: MfaFactor | null,
    proof: SecondFactorRequest | null,
    now: Date,
  ): Promise<VerificationMethod | 'password' | null> {
    if (!isConfirmed(factor)) return 'password';
    return proof === null ? null : this.verifier.verify(tx, factor, proof, now);
  }

  private async record(
    tx: TenantTransaction,
    session: Session,
    method: VerificationMethod | 'password',
    meta: RequestMeta,
    now: Date,
  ): Promise<void> {
    await tx.session.update({
      where: { id: session.id },
      data: { reauthenticatedAt: now, mfaFailures: 0 },
    });
    await recordAuditEvent(tx, {
      tenantId: session.tenantId,
      occurredAt: now,
      actor: { kind: 'user', id: session.userId },
      action: 'iam.session.reauthenticate',
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

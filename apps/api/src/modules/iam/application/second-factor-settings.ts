import { Inject, Injectable } from '@nestjs/common';
import type { SecondFactorStatusResponse } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent, recordSecurityEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { secondFactorRequired } from '../domain/second-factor-policy.js';
import { loadUser, revokeOtherSessions } from '../infrastructure/accounts-store.js';
import {
  clearFactor,
  isConfirmed,
  loadFactor,
  remainingRecoveryCodes,
  revokeRecoveryCodes,
} from '../infrastructure/second-factor-store.js';
import { AccountNotifier } from './account-notifier.js';
import { secondFactorMandatory, secondFactorNotConfigured } from './iam-messages.js';
import { SecondFactorVerifier } from './second-factor-verifier.js';

/**
 * El segundo factor desde «Mi perfil» (B09): ver su estado, generar códigos de recuperación nuevos
 * y desactivarlo cuando es opcional. Las dos últimas son acciones de alto riesgo: el controlador
 * exige confirmación de identidad reciente, y cada una avisa por correo.
 */
@Injectable()
export class SecondFactorSettings {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SecondFactorVerifier) private readonly verifier: SecondFactorVerifier,
    @Inject(AccountNotifier) private readonly notifier: AccountNotifier,
  ) {}

  async status(principal: Principal): Promise<SecondFactorStatusResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: principal.userId } });
      const factor = await loadFactor(tx, user.id);
      const enabled = isConfirmed(factor);
      return {
        required: secondFactorRequired(user),
        enabled,
        confirmed_at: enabled ? factor.confirmedAt.toISOString() : null,
        recovery_codes_remaining: enabled ? await remainingRecoveryCodes(tx, user.id) : 0,
      };
    });
  }

  /** Diez códigos nuevos; los anteriores dejan de servir. Se muestran una sola vez. */
  async regenerateRecoveryCodes(principal: Principal, meta: RequestMeta): Promise<string[]> {
    const now = this.clock.now();
    const codes = await this.database.withTenant(principal, async (tx) => {
      const factor = await loadFactor(tx, principal.userId);
      if (!isConfirmed(factor)) throw secondFactorNotConfigured();
      const issued = await this.verifier.issueRecoveryCodes(tx, factor, now);
      await this.record(tx, principal, {
        action: 'iam.mfa.recovery_codes_regenerate',
        securityType: 'iam.mfa.recovery_codes_regenerated',
        entityId: factor.id,
        changes: { count: issued.length },
        meta,
        now,
      });
      return issued;
    });
    await this.notify(principal, 'recovery_codes_regenerated', meta, now);
    return codes;
  }

  /** Solo si es opcional para la persona. Cierra sus demás sesiones. */
  async disable(principal: Principal, meta: RequestMeta): Promise<void> {
    const now = this.clock.now();
    await this.database.withTenant(principal, async (tx) => {
      const user = await loadUser(tx, principal.userId);
      if (user === null) throw secondFactorNotConfigured();
      if (secondFactorRequired(user)) throw secondFactorMandatory();
      const factor = await loadFactor(tx, user.id);
      if (!isConfirmed(factor)) throw secondFactorNotConfigured();
      await clearFactor(tx, user.id);
      await revokeRecoveryCodes(tx, user.id, now);
      const owner = { userId: user.id, keepSessionId: principal.sessionId };
      const closed = await revokeOtherSessions(tx, owner, 'mfa_changed', now);
      await this.record(tx, principal, {
        action: 'iam.mfa.disable',
        securityType: 'iam.mfa.disabled',
        entityId: factor.id,
        changes: { sessions_closed: closed },
        meta,
        now,
      });
      await addOutboxEvent(tx, {
        tenantId: principal.tenantId,
        eventType: 'security.alert',
        actorId: principal.userId,
        occurredAt: now,
        payload: { type: 'iam.mfa.disabled', user_id: principal.userId },
      });
    });
    await this.notify(principal, 'mfa_disabled', meta, now);
  }

  private async record(
    tx: TenantTransaction,
    principal: Principal,
    event: {
      readonly action: string;
      readonly securityType: string;
      readonly entityId: string;
      readonly changes: Record<string, number>;
      readonly meta: RequestMeta;
      readonly now: Date;
    },
  ): Promise<void> {
    const { tenantId, userId } = principal;
    await recordAuditEvent(tx, {
      tenantId,
      occurredAt: event.now,
      actor: { kind: 'user', id: userId },
      action: event.action,
      entityType: 'iam_mfa_factor',
      entityId: event.entityId,
      result: 'success',
      changes: event.changes,
      meta: event.meta,
    });
    await recordSecurityEvent(tx, {
      tenantId,
      occurredAt: event.now,
      type: event.securityType,
      userId,
      severity: 'medium',
      detail: event.changes,
      meta: event.meta,
    });
  }

  private async notify(
    principal: Principal,
    purpose: 'recovery_codes_regenerated' | 'mfa_disabled',
    meta: RequestMeta,
    now: Date,
  ): Promise<void> {
    await this.notifier.request({
      tenantId: principal.tenantId,
      actorId: principal.userId,
      accountUserId: principal.userId,
      purpose,
      correlationId: meta.correlationId,
      occurredAt: now,
    });
  }
}

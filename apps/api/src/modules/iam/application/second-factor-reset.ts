import { Inject, Injectable } from '@nestjs/common';

import { recordAuditEvent, recordSecurityEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { revokeAllSessions } from '../infrastructure/accounts-store.js';
import { findLoginUser, type IdentityRef } from '../infrastructure/identity-lookup.js';
import { clearFactor, revokeRecoveryCodes } from '../infrastructure/second-factor-store.js';
import { AccountNotifier } from './account-notifier.js';

/** Sin petición web: el comando no tiene dirección IP ni navegador. */
const COMMAND_META: RequestMeta = { ip: null, userAgent: null, correlationId: null };

export interface SecondFactorResetResult {
  readonly userId: string;
  readonly sessionsClosed: number;
}

/**
 * Reinicio del segundo factor por el responsable técnico, cuando la persona perdió el celular y
 * los códigos (B09, `pnpm iam:reiniciar-segundo-factor`). La pantalla de usuarios con el permiso
 * iam.user.reset_mfa llega en B10. Borra el secreto y los códigos, cierra todas las sesiones y
 * avisa a la persona: al volver a entrar, configura su segundo factor de nuevo.
 */
@Injectable()
export class SecondFactorResetUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AccountNotifier) private readonly notifier: AccountNotifier,
  ) {}

  /** Null si el correo no tiene cuenta. */
  async execute(email: string): Promise<SecondFactorResetResult | null> {
    const ref = await findLoginUser(this.database, email);
    if (ref === null) return null;
    const now = this.clock.now();
    const { tenantId, userId } = ref;
    const closed = await this.database.withTenant({ tenantId, userId: null }, (tx) =>
      this.reset(tx, ref, now),
    );
    await this.notifier.request({
      tenantId,
      actorId: null,
      accountUserId: userId,
      purpose: 'mfa_reset',
      correlationId: null,
      occurredAt: now,
    });
    return { userId, sessionsClosed: closed };
  }

  private async reset(tx: TenantTransaction, ref: IdentityRef, now: Date): Promise<number> {
    const { tenantId, userId } = ref;
    const hadFactor = await clearFactor(tx, userId);
    await revokeRecoveryCodes(tx, userId, now);
    const sessionsClosed = await revokeAllSessions(tx, userId, 'mfa_reset', now);
    const changes = { had_factor: hadFactor, sessions_closed: sessionsClosed };
    await recordAuditEvent(tx, {
      tenantId,
      occurredAt: now,
      actor: { kind: 'system' },
      action: 'iam.user.reset_mfa',
      entityType: 'iam_user',
      entityId: userId,
      result: 'success',
      changes,
      meta: COMMAND_META,
    });
    await recordSecurityEvent(tx, {
      tenantId,
      occurredAt: now,
      type: 'iam.mfa.reset',
      userId,
      severity: 'high',
      detail: changes,
      meta: COMMAND_META,
    });
    await addOutboxEvent(tx, {
      tenantId,
      eventType: 'security.alert',
      actorId: null,
      occurredAt: now,
      payload: { type: 'iam.mfa.reset', user_id: userId },
    });
    return sessionsClosed;
  }
}

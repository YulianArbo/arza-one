import { Inject, Injectable } from '@nestjs/common';

import { recordAuditEvent, recordSecurityEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { revokeAllSessions } from '../infrastructure/accounts-store.js';
import { findLoginUser, type IdentityRef } from '../infrastructure/identity-lookup.js';
import { clearFactor, revokeRecoveryCodes } from '../infrastructure/second-factor-store.js';
import { selfAction, userNotFound } from './access-messages.js';
import { AccountNotifier } from './account-notifier.js';
import { COMMAND_META } from './permission-change.js';

export interface SecondFactorResetResult {
  readonly userId: string;
  readonly sessionsClosed: number;
}

/**
 * Reinicio del segundo factor por el responsable técnico, cuando la persona perdió el celular y
 * los códigos: con el comando `pnpm iam:reiniciar-segundo-factor` (B09) o desde la pantalla de
 * usuarios con el permiso iam.user.reset_mfa (B10). Borra el secreto y los códigos, cierra todas
 * las sesiones y avisa a la persona: al volver a entrar, configura su segundo factor de nuevo.
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
      this.reset(tx, ref, { actorId: null, meta: COMMAND_META }, now),
    );
    await this.notify(ref, null, now);
    return { userId, sessionsClosed: closed };
  }

  /** Desde la pantalla de usuarios. Nadie reinicia el suyo: lo cambia en «Mi perfil». */
  async forUser(principal: Principal, userId: string, meta: RequestMeta): Promise<number> {
    if (userId === principal.userId) throw selfAction();
    const now = this.clock.now();
    const ref = { tenantId: principal.tenantId, userId };
    const closed = await this.database.withTenant(principal, async (tx) => {
      const user = await tx.user.findFirst({ where: { id: userId, deletedAt: null } });
      if (user === null || user.kind === 'service') throw userNotFound();
      return this.reset(tx, ref, { actorId: principal.userId, meta }, now);
    });
    await this.notify(ref, principal.userId, now);
    return closed;
  }

  private async notify(ref: IdentityRef, actorId: string | null, now: Date): Promise<void> {
    await this.notifier.request({
      tenantId: ref.tenantId,
      actorId,
      accountUserId: ref.userId,
      purpose: 'mfa_reset',
      correlationId: null,
      occurredAt: now,
    });
  }

  private async reset(
    tx: TenantTransaction,
    ref: IdentityRef,
    by: { readonly actorId: string | null; readonly meta: RequestMeta },
    now: Date,
  ): Promise<number> {
    const { tenantId, userId } = ref;
    const hadFactor = await clearFactor(tx, userId);
    await revokeRecoveryCodes(tx, userId, now);
    const sessionsClosed = await revokeAllSessions(tx, userId, 'mfa_reset', now);
    const changes = { had_factor: hadFactor, sessions_closed: sessionsClosed };
    await recordAuditEvent(tx, {
      tenantId,
      occurredAt: now,
      actor: by.actorId === null ? { kind: 'system' } : { kind: 'user', id: by.actorId },
      action: 'iam.user.reset_mfa',
      entityType: 'iam_user',
      entityId: userId,
      result: 'success',
      changes,
      meta: by.meta,
    });
    await recordSecurityEvent(tx, {
      tenantId,
      occurredAt: now,
      type: 'iam.mfa.reset',
      userId,
      severity: 'high',
      detail: { ...changes, actor_id: by.actorId },
      meta: by.meta,
    });
    await addOutboxEvent(tx, {
      tenantId,
      eventType: 'security.alert',
      actorId: by.actorId,
      occurredAt: now,
      payload: { type: 'iam.mfa.reset', user_id: userId },
    });
    return sessionsClosed;
  }
}

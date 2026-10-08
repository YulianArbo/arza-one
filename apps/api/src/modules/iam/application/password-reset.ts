import { Inject, Injectable } from '@nestjs/common';
import type { ForgotPasswordRequest, ResetPasswordRequest } from '@arza/contracts';

import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { canSignIn } from '../domain/user.js';
import { consumeLink, loadUser, revokeAllSessions } from '../infrastructure/accounts-store.js';
import {
  findLink,
  findLoginUser,
  recordLoginAttempt,
  type LinkRef,
} from '../infrastructure/identity-lookup.js';
import { hashSecretToken } from '../infrastructure/secret-token.js';
import { AccountNotifier } from './account-notifier.js';
import { linkInvalid } from './iam-messages.js';
import { PasswordSetter } from './password-setter.js';

/**
 * Recuperación de contraseña (numeral 15.1): enlace de un solo uso de 30 minutos; al cambiarla se
 * cierran todas las sesiones y se avisa a la persona. La solicitud responde lo mismo exista o no
 * la cuenta.
 */
@Injectable()
export class PasswordResetUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AccountNotifier) private readonly notifier: AccountNotifier,
    @Inject(PasswordSetter) private readonly passwords: PasswordSetter,
  ) {}

  /** Pide el enlace. No dice si la cuenta existe: el controlador siempre responde igual. */
  async request(input: ForgotPasswordRequest, meta: RequestMeta): Promise<void> {
    const ref = await findLoginUser(this.database, input.email);
    if (ref === null) return;
    const now = this.clock.now();
    const eligible = await this.database.withTenant(
      { tenantId: ref.tenantId, userId: null },
      async (tx) => {
        const user = await loadUser(tx, ref.userId);
        if (user === null || !canSignIn(user)) return false;
        await recordAuditEvent(tx, {
          tenantId: ref.tenantId,
          occurredAt: now,
          actor: { kind: 'anonymous' },
          action: 'iam.password.reset_request',
          entityType: 'iam_user',
          entityId: ref.userId,
          result: 'success',
          meta,
        });
        return true;
      },
    );
    if (!eligible) return;
    await this.notifier.request({
      tenantId: ref.tenantId,
      actorId: null,
      accountUserId: ref.userId,
      purpose: 'password_reset',
      correlationId: meta.correlationId,
    });
  }

  /** Cambia la contraseña con el enlace recibido y cierra todas las sesiones. */
  async complete(input: ResetPasswordRequest, meta: RequestMeta): Promise<void> {
    const now = this.clock.now();
    const link = await findLink(this.database, hashSecretToken(input.token), 'password_reset', now);
    if (link === null) throw linkInvalid();
    const passwordHash = await this.passwords.hashNew(input.password);
    const email = await this.database.withTenant(
      { tenantId: link.tenantId, userId: link.userId },
      (tx) => this.applyReset(tx, link, passwordHash, meta, now),
    );
    // Un cambio con el enlace del correo prueba que la persona es dueña de la cuenta: reinicia
    // el conteo de intentos fallidos.
    await recordLoginAttempt(this.database, {
      email,
      ip: meta.ip,
      succeeded: true,
      reason: 'password_reset',
      occurredAt: now,
    });
    await this.notifier.request({
      tenantId: link.tenantId,
      actorId: link.userId,
      accountUserId: link.userId,
      purpose: 'password_changed',
      correlationId: meta.correlationId,
    });
  }

  private async applyReset(
    tx: TenantTransaction,
    link: LinkRef,
    passwordHash: string,
    meta: RequestMeta,
    now: Date,
  ): Promise<string> {
    const user = await loadUser(tx, link.userId);
    if (user === null || !canSignIn(user) || !(await consumeLink(tx, link.tokenId, now))) {
      throw linkInvalid();
    }
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordChangedAt: now, lockedUntil: null },
    });
    const closed = await revokeAllSessions(tx, user.id, 'password_reset', now);
    await recordAuditEvent(tx, {
      tenantId: link.tenantId,
      occurredAt: now,
      actor: { kind: 'user', id: user.id },
      action: 'iam.password.reset',
      entityType: 'iam_user',
      entityId: user.id,
      result: 'success',
      changes: { sessions_closed: closed },
      meta,
    });
    return user.email;
  }
}

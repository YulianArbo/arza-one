import { Inject, Injectable } from '@nestjs/common';
import type { ChangePasswordRequest } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { loadUser, revokeAllSessions } from '../infrastructure/accounts-store.js';
import { verifyPassword } from '../infrastructure/password-hasher.js';
import { AccountNotifier } from './account-notifier.js';
import { currentPasswordIncorrect, passwordUnchanged } from './iam-messages.js';
import { PasswordSetter } from './password-setter.js';

/**
 * Cambio de contraseña desde el perfil. Pide la actual, cierra todas las sesiones, incluida la
 * que hizo el cambio (criterio de B08), y avisa por correo.
 */
@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AccountNotifier) private readonly notifier: AccountNotifier,
    @Inject(PasswordSetter) private readonly passwords: PasswordSetter,
  ) {}

  async execute(
    principal: Principal,
    input: ChangePasswordRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.checkCurrent(principal, input);
    const passwordHash = await this.passwords.hashNew(input.new_password);
    const now = this.clock.now();
    await this.database.withTenant(principal, async (tx) => {
      await tx.user.update({
        where: { id: principal.userId },
        data: { passwordHash, passwordChangedAt: now },
      });
      const closed = await revokeAllSessions(tx, principal.userId, 'password_changed', now);
      await recordAuditEvent(tx, {
        tenantId: principal.tenantId,
        occurredAt: now,
        actor: { kind: 'user', id: principal.userId },
        action: 'iam.password.change',
        entityType: 'iam_user',
        entityId: principal.userId,
        result: 'success',
        changes: { sessions_closed: closed },
        meta,
      });
    });
    await this.notifier.request({
      tenantId: principal.tenantId,
      actorId: principal.userId,
      accountUserId: principal.userId,
      purpose: 'password_changed',
      correlationId: meta.correlationId,
    });
  }

  /** La contraseña actual debe coincidir y la nueva debe ser distinta. */
  private async checkCurrent(principal: Principal, input: ChangePasswordRequest): Promise<void> {
    const current = await this.database.withTenant(principal, (tx) =>
      loadUser(tx, principal.userId),
    );
    const storedHash = current?.passwordHash ?? null;
    if (storedHash === null || !(await verifyPassword(input.current_password, storedHash))) {
      throw currentPasswordIncorrect();
    }
    if (await verifyPassword(input.new_password, storedHash)) throw passwordUnchanged();
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { ACCESS_RULES, type AccessReviewResponse } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { isUnusedAccount } from '../domain/access-policy.js';
import { allUsers } from '../infrastructure/user-directory-store.js';
import { userSummaryOf } from './user-directory.js';

/**
 * Informe de revisión de accesos para la Dirección (ficha 17.2, revisión trimestral): usuarios,
 * roles vigentes, último ingreso y cuentas activas sin uso en 60 días. Cada consulta queda en la
 * auditoría, porque el informe reúne datos de todas las cuentas.
 */
@Injectable()
export class AccessReviewQuery {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(principal: Principal, meta: RequestMeta): Promise<AccessReviewResponse> {
    const now = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const users = (await allUsers(tx, now)).map((user) => ({
        ...userSummaryOf(user),
        unused: isUnusedAccount(user, now),
      }));
      const totals = {
        users: users.length,
        active: users.filter((user) => user.status === 'active').length,
        unused: users.filter((user) => user.unused).length,
        without_roles: users.filter((user) => user.roles.length === 0).length,
      };
      await recordAuditEvent(tx, {
        tenantId: principal.tenantId,
        occurredAt: now,
        actor: { kind: 'user', id: principal.userId },
        action: 'iam.access_review.read',
        entityType: 'iam_access_review',
        entityId: null,
        result: 'success',
        changes: totals,
        meta,
      });
      return {
        generated_at: now.toISOString(),
        unused_days: ACCESS_RULES.unusedAccountDays,
        totals,
        users,
      };
    });
  }
}

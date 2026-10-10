import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import { findRoleByCode, lockUser } from '../infrastructure/assignment-store.js';
import { findLoginUser } from '../infrastructure/identity-lookup.js';
import type { AccountNotifier } from './account-notifier.js';
import { grantRole } from './role-assignment.js';

export interface CliAssignmentInput {
  readonly email: string;
  readonly roleCode: string;
  readonly validUntil: Date | null;
}

/**
 * Asignación de un rol por el responsable técnico con `pnpm iam:asignar-rol` (B10): la hace el
 * sistema, con las mismas reglas que la pantalla. Así se asigna el primer administrador.
 */
export class CliRoleAssignment {
  constructor(
    private readonly database: DatabaseService,
    private readonly clock: Clock,
    private readonly notifier: AccountNotifier,
  ) {}

  async execute(input: CliAssignmentInput): Promise<'assigned' | 'not_found'> {
    const ref = await findLoginUser(this.database, input.email);
    if (ref === null) return 'not_found';
    const now = this.clock.now();
    const { tenantId, userId } = ref;
    const assigned = await this.database.withTenant({ tenantId, userId: null }, async (tx) => {
      // El rol se busca antes de bloquear la cuenta: si no existe, la transacción no toca nada.
      const role = await findRoleByCode(tx, input.roleCode);
      if (role === null) return false;
      const user = await lockUser(tx, userId);
      if (user === null) return false;
      const grant = { tenantId, actorId: null, user, role, validUntil: input.validUntil };
      await grantRole(tx, { ...grant, now, meta: null });
      return true;
    });
    if (!assigned) return 'not_found';
    await this.notifier.request({
      tenantId,
      actorId: null,
      accountUserId: userId,
      purpose: 'permissions_changed',
      correlationId: null,
      occurredAt: now,
    });
    return 'assigned';
  }
}

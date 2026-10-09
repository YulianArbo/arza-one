import { Inject, Injectable } from '@nestjs/common';
import { ACCESS_RULES, type AssignRoleRequest } from '@arza/contracts';

import type { Role, User } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { assignmentExpiryProblem, fitsAudience } from '../domain/access-policy.js';
import {
  createAssignment,
  findRole,
  hasActiveAssignment,
  lockUser,
  revokeAssignment,
} from '../infrastructure/assignment-store.js';
import {
  assignmentNotFound,
  roleAlreadyAssigned,
  roleAudienceMismatch,
  roleExpiryInvalid,
  roleNotFound,
  selfPermissionChange,
  userNotFound,
  userStateInvalid,
} from './access-messages.js';
import { AccountNotifier } from './account-notifier.js';
import { recordPermissionChange } from './permission-change.js';

export interface GrantRequest {
  readonly tenantId: string;
  /** Quien asigna; null si es el sistema (comandos, invitación por comando). */
  readonly actorId: string | null;
  readonly user: User;
  readonly role: Role;
  readonly validUntil: Date | null;
  readonly now: Date;
  readonly meta: RequestMeta | null;
}

/**
 * Asigna un rol dentro de una transacción ya abierta, con todas sus reglas: nunca a uno mismo,
 * del tipo de cuenta correcto, con vigencia válida y sin repetir uno vigente. El administrador
 * del cliente pasa a exigir segundo factor (numeral 15.1). La usan la pantalla de usuarios, la
 * invitación y el comando del responsable técnico.
 */
export async function grantRole(tx: TenantTransaction, request: GrantRequest): Promise<string> {
  const { user, role, now } = request;
  if (request.actorId === user.id) throw selfPermissionChange();
  if (user.status === 'inactive') throw userStateInvalid('La cuenta está inactiva.');
  if (!fitsAudience(role.audience, user.kind)) throw roleAudienceMismatch();
  const expiry = assignmentExpiryProblem(role.code, request.validUntil, now);
  if (expiry !== null) throw roleExpiryInvalid(expiry);
  if (await hasActiveAssignment(tx, user.id, role.id, now)) throw roleAlreadyAssigned();
  const assignment = await createAssignment(tx, {
    tenantId: request.tenantId,
    userId: user.id,
    roleId: role.id,
    validUntil: request.validUntil,
    assignedBy: request.actorId,
    now,
  });
  const requireSecondFactor = role.code === ACCESS_RULES.secondFactorRole && !user.mfaRequired;
  if (requireSecondFactor) {
    await tx.user.update({ where: { id: user.id }, data: { mfaRequired: true } });
  }
  await recordPermissionChange(tx, {
    tenantId: request.tenantId,
    actorId: request.actorId,
    action: 'iam.role.assign',
    entityType: 'iam_user',
    entityId: user.id,
    changes: {
      role_code: role.code,
      assignment_id: assignment.id,
      valid_until: request.validUntil?.toISOString() ?? null,
      ...(requireSecondFactor ? { mfa_required: { from: false, to: true } } : {}),
    },
    occurredAt: now,
    meta: request.meta,
  });
  return assignment.id;
}

/**
 * Asignar y retirar roles desde la pantalla de usuarios (iam.role.assign). Nadie cambia sus
 * propios roles (ficha 17.2). La persona recibe un aviso por correo, y el cambio surte efecto en
 * su siguiente petición, porque los permisos se calculan en cada una.
 */
@Injectable()
export class RoleAssignmentUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AccountNotifier) private readonly notifier: AccountNotifier,
  ) {}

  async assign(
    principal: Principal,
    userId: string,
    input: AssignRoleRequest,
    meta: RequestMeta,
  ): Promise<string> {
    if (userId === principal.userId) throw selfPermissionChange();
    const now = this.clock.now();
    const validUntil = input.valid_until === null ? null : new Date(input.valid_until);
    const assignmentId = await this.database.withTenant(principal, async (tx) => {
      const user = await lockUser(tx, userId);
      if (user === null) throw userNotFound();
      const role = await findRole(tx, input.role_id);
      if (role === null) throw roleNotFound();
      const actorId = principal.userId;
      const grant = { tenantId: principal.tenantId, actorId, user, role, validUntil, now, meta };
      return grantRole(tx, grant);
    });
    await this.notify(principal, userId, now);
    return assignmentId;
  }

  async revoke(
    principal: Principal,
    target: { readonly userId: string; readonly assignmentId: string },
    meta: RequestMeta,
  ): Promise<void> {
    if (target.userId === principal.userId) throw selfPermissionChange();
    const now = this.clock.now();
    await this.database.withTenant(principal, async (tx) => {
      if ((await lockUser(tx, target.userId)) === null) throw userNotFound();
      const role = await revokeAssignment(tx, target, principal.userId, now);
      if (role === null) throw assignmentNotFound();
      await recordPermissionChange(tx, {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        action: 'iam.role.revoke',
        entityType: 'iam_user',
        entityId: target.userId,
        changes: { role_code: role.code, assignment_id: target.assignmentId },
        occurredAt: now,
        meta,
      });
    });
    await this.notify(principal, target.userId, now);
  }

  private async notify(principal: Principal, userId: string, now: Date): Promise<void> {
    await this.notifier.request({
      tenantId: principal.tenantId,
      actorId: principal.userId,
      accountUserId: userId,
      purpose: 'permissions_changed',
      correlationId: null,
      occurredAt: now,
    });
  }
}

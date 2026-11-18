import { ACCESS_RULES } from '@arza/contracts';

import type { Role, User } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { findRole, findRoleByCode } from '../infrastructure/assignment-store.js';
import { roleNotFound } from './access-messages.js';
import { missingSystemRoles } from './invitation-messages.js';
import { grantRole } from './role-assignment.js';

/** Roles y empresa que el alta de la invitación aplica sobre la cuenta recién creada. */
interface InvitationRoles {
  readonly tenantId: string;
  readonly kind: 'internal' | 'portal';
  readonly actorId?: string | null;
  readonly roleIds?: readonly string[];
  readonly meta?: RequestMeta | null;
}

/** Datos de la persona y el cargo que se vinculan a la cuenta interna invitada. */
export interface EmployeeInvitationInput {
  readonly email: string;
  readonly displayName: string;
  readonly partyId: string;
  readonly positionId: string;
}

/** Quién reenvió la invitación de una cuenta que sigue invitada. */
export async function recordResent(
  tx: TenantTransaction,
  event: {
    readonly tenantId: string;
    readonly actorId: string | null;
    readonly userId: string;
    readonly meta: RequestMeta | null;
    readonly now: Date;
  },
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: event.tenantId,
    occurredAt: event.now,
    actor: event.actorId === null ? { kind: 'system' } : { kind: 'user', id: event.actorId },
    action: 'iam.user.invite',
    entityType: 'iam_user',
    entityId: event.userId,
    result: 'success',
    changes: { resent: true },
    meta: event.meta,
  });
}

/** COLABORADOR para toda persona interna (B10) y los roles elegidos al invitar. */
export async function grantInitialRoles(
  tx: TenantTransaction,
  target: { readonly input: InvitationRoles; readonly user: User; readonly now: Date },
): Promise<void> {
  const { input, now } = target;
  const roles: Role[] = [];
  if (input.kind === 'internal') {
    const colaborador = await findRoleByCode(tx, ACCESS_RULES.defaultInternalRole);
    if (colaborador === null) throw missingSystemRoles();
    roles.push(colaborador);
  }
  for (const roleId of input.roleIds ?? []) {
    if (roles.some((role) => role.id === roleId)) continue;
    const role = await findRole(tx, roleId);
    if (role === null) throw roleNotFound();
    roles.push(role);
  }
  let user = target.user;
  for (const role of roles) {
    const grant = { tenantId: input.tenantId, actorId: input.actorId ?? null, user, role };
    await grantRole(tx, { ...grant, validUntil: null, now, meta: input.meta ?? null });
    user = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
  }
}

/** Vincula la cuenta recién invitada con su persona en Terceros y su cargo en la empresa. */
export async function linkEmployeeAccount(
  tx: TenantTransaction,
  target: {
    readonly principal: Principal;
    readonly meta: RequestMeta;
    readonly id: string;
    readonly input: EmployeeInvitationInput;
    readonly now: Date;
  },
): Promise<void> {
  const { principal, meta, id, input, now } = target;
  await tx.user.update({
    where: { id },
    data: { partyId: input.partyId, positionId: input.positionId },
  });
  await recordAuditEvent(tx, {
    tenantId: principal.tenantId,
    occurredAt: now,
    actor: { kind: 'user', id: principal.userId },
    action: 'iam.user.person_link',
    entityType: 'iam_user',
    entityId: id,
    result: 'success',
    changes: { party_id: input.partyId, position_id: input.positionId },
    meta,
  });
}

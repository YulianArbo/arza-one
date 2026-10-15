import { isPermissionCode, type PermissionCode } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { activeRoles } from './access-store.js';

// Consultas de personas para el motor de flujos (B15): roles vigentes, aprobaciones delegadas y
// cargo. Los demás módulos las piden por el índice de iam; nunca leen las tablas iam_.

/** Códigos de los roles vigentes de la persona. */
export async function activeRoleCodes(
  tx: TenantTransaction,
  userId: string,
  now: Date,
): Promise<string[]> {
  return (await activeRoles(tx, userId, now)).map((role) => role.code);
}

export interface ReceivedDelegation {
  readonly fromUserId: string;
  readonly permissions: readonly PermissionCode[];
}

/** Aprobaciones que otras personas delegaron en esta y que hoy están vigentes (B10). */
export async function delegationsTo(
  tx: TenantTransaction,
  userId: string,
  now: Date,
): Promise<ReceivedDelegation[]> {
  const rows = await tx.delegation.findMany({
    where: {
      toUserId: userId,
      deletedAt: null,
      revokedAt: null,
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    select: { fromUserId: true, scope: true },
  });
  return rows.map((row) => ({
    fromUserId: row.fromUserId,
    permissions: (Array.isArray(row.scope) ? row.scope : []).flatMap((code) =>
      typeof code === 'string' && isPermissionCode(code) ? [code] : [],
    ),
  }));
}

/** Cargo de la persona, o null si no tiene. */
export async function positionOfUser(
  tx: TenantTransaction,
  userId: string,
): Promise<string | null> {
  const user = await tx.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { positionId: true },
  });
  return user?.positionId ?? null;
}

const ACTIVE_INTERNAL = { deletedAt: null, kind: 'internal', status: 'active' } as const;

/** Personas internas activas que ocupan el cargo, de la cuenta más antigua a la más nueva. */
export async function activeUsersInPosition(
  tx: TenantTransaction,
  positionId: string,
): Promise<string[]> {
  const users = await tx.user.findMany({
    where: { positionId, ...ACTIVE_INTERNAL },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return users.map((user) => user.id);
}

/** La persona es un colaborador interno con la cuenta activa. */
export async function isActiveInternalUser(
  tx: TenantTransaction,
  userId: string,
): Promise<boolean> {
  return (await tx.user.count({ where: { id: userId, ...ACTIVE_INTERNAL } })) > 0;
}

/** De los códigos dados, los de roles que existen en la empresa. */
export async function existingRoleCodes(
  tx: TenantTransaction,
  codes: readonly string[],
): Promise<Set<string>> {
  if (codes.length === 0) return new Set();
  const roles = await tx.role.findMany({
    where: { code: { in: [...new Set(codes)] }, deletedAt: null },
    select: { code: true },
  });
  return new Set(roles.map((role) => role.code));
}

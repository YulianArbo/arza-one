import { isPermissionCode, type PermissionCode } from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Lecturas de roles y permisos dentro de la transacción de la empresa (B10).

/** Condición guardada de un permiso «solo lo propio» (letra P). Sin condición vale para todo. */
export const OWN_CONDITION = { scope: 'own' } as const;

export interface StoredGrant {
  readonly code: PermissionCode;
  readonly own: boolean;
}

export interface ActiveRole {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

/** Asignaciones vigentes: no retiradas, ya empezadas y sin vencer. */
export function activeAssignmentWhere(now: Date): Prisma.UserRoleWhereInput {
  return {
    revokedAt: null,
    deletedAt: null,
    validFrom: { lte: now },
    OR: [{ validUntil: null }, { validUntil: { gt: now } }],
    role: { deletedAt: null },
  };
}

export function isOwnCondition(conditions: Prisma.JsonValue): boolean {
  return (
    typeof conditions === 'object' &&
    conditions !== null &&
    !Array.isArray(conditions) &&
    conditions['scope'] === OWN_CONDITION.scope
  );
}

/** Permisos que la persona recibe hoy de todos sus roles vigentes; se suman (numeral 15.2). */
export async function activeGrants(
  tx: TenantTransaction,
  userId: string,
  now: Date,
): Promise<StoredGrant[]> {
  const rows = await tx.rolePermission.findMany({
    where: {
      deletedAt: null,
      role: { deletedAt: null, assignments: { some: { userId, ...activeAssignmentWhere(now) } } },
    },
    select: { conditions: true, permission: { select: { code: true } } },
  });
  return rows.flatMap((row) => {
    const code = row.permission.code;
    return isPermissionCode(code) ? [{ code, own: isOwnCondition(row.conditions) }] : [];
  });
}

/** Roles vigentes de la persona, por nombre. */
export async function activeRoles(
  tx: TenantTransaction,
  userId: string,
  now: Date,
): Promise<ActiveRole[]> {
  const assignments = await tx.userRole.findMany({
    where: { userId, ...activeAssignmentWhere(now) },
    select: { role: { select: { id: true, code: true, name: true } } },
    orderBy: { role: { name: 'asc' } },
  });
  const unique = new Map(assignments.map(({ role }) => [role.id, role]));
  return [...unique.values()];
}

import type { Role, User, UserRole } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { activeAssignmentWhere } from './access-store.js';

// Escrituras de asignaciones de roles (B10), siempre dentro de la transacción de la empresa.

/**
 * Bloquea la fila de la persona hasta el final de la transacción: dos cambios de roles de la
 * misma persona a la vez se hacen uno después del otro, y no quedan dos asignaciones iguales.
 * Devuelve la cuenta, o null si no existe en la empresa.
 */
export async function lockUser(tx: TenantTransaction, userId: string): Promise<User | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM iam_users WHERE id = ${userId}::uuid AND deleted_at IS NULL FOR UPDATE`;
  if (rows.length === 0) return null;
  return tx.user.findUnique({ where: { id: userId } });
}

export async function findRole(tx: TenantTransaction, roleId: string): Promise<Role | null> {
  return tx.role.findFirst({ where: { id: roleId, deletedAt: null } });
}

export async function findRoleByCode(tx: TenantTransaction, code: string): Promise<Role | null> {
  return tx.role.findFirst({ where: { code, deletedAt: null } });
}

/** Asignación vigente, sin alcance, del mismo rol: no se repite. */
export async function hasActiveAssignment(
  tx: TenantTransaction,
  userId: string,
  roleId: string,
  now: Date,
): Promise<boolean> {
  const found = await tx.userRole.findFirst({
    where: { userId, roleId, scopeType: null, ...activeAssignmentWhere(now) },
    select: { id: true },
  });
  return found !== null;
}

export interface NewAssignment {
  readonly tenantId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly validUntil: Date | null;
  /** null si lo asigna el sistema. */
  readonly assignedBy: string | null;
  readonly now: Date;
}

export async function createAssignment(
  tx: TenantTransaction,
  assignment: NewAssignment,
): Promise<UserRole> {
  return tx.userRole.create({
    data: {
      tenantId: assignment.tenantId,
      userId: assignment.userId,
      roleId: assignment.roleId,
      validFrom: assignment.now,
      validUntil: assignment.validUntil,
      assignedBy: assignment.assignedBy,
    },
  });
}

/** Retira una asignación que siga sin retirar. Devuelve el rol retirado, o null. */
export async function revokeAssignment(
  tx: TenantTransaction,
  target: { readonly userId: string; readonly assignmentId: string },
  revokedBy: string,
  now: Date,
): Promise<Role | null> {
  const assignment = await tx.userRole.findFirst({
    where: { id: target.assignmentId, userId: target.userId, revokedAt: null, deletedAt: null },
    include: { role: true },
  });
  if (assignment === null) return null;
  await tx.userRole.update({
    where: { id: assignment.id },
    data: { revokedAt: now, revokedBy },
  });
  return assignment.role;
}

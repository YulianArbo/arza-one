import { isPermissionCode, type GrantedPermission } from '@arza/contracts';

import { Prisma, type Role } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { OWN_CONDITION, activeAssignmentWhere, isOwnCondition } from './access-store.js';

// Lecturas y escrituras de roles y de sus permisos (B10).

export interface RoleWithCounts extends Role {
  readonly permissionCount: number;
  readonly assignedUsers: number;
}

function countsSelect(now: Date) {
  return {
    _count: {
      select: {
        permissions: { where: { deletedAt: null } },
        assignments: { where: activeAssignmentWhere(now) },
      },
    },
  } as const;
}

function withCounts(
  role: Role & { _count: { permissions: number; assignments: number } },
): RoleWithCounts {
  const { _count: counts, ...rest } = role;
  return { ...rest, permissionCount: counts.permissions, assignedUsers: counts.assignments };
}

export async function listRoles(tx: TenantTransaction, now: Date): Promise<RoleWithCounts[]> {
  const roles = await tx.role.findMany({
    where: { deletedAt: null },
    include: countsSelect(now),
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  });
  return roles.map(withCounts);
}

export async function findRoleWithCounts(
  tx: TenantTransaction,
  roleId: string,
  now: Date,
): Promise<RoleWithCounts | null> {
  const role = await tx.role.findFirst({
    where: { id: roleId, deletedAt: null },
    include: countsSelect(now),
  });
  return role === null ? null : withCounts(role);
}

export async function rolePermissions(
  tx: TenantTransaction,
  roleId: string,
): Promise<GrantedPermission[]> {
  const rows = await tx.rolePermission.findMany({
    where: { roleId, deletedAt: null },
    select: { conditions: true, permission: { select: { code: true } } },
    orderBy: { permission: { code: 'asc' } },
  });
  // El catálogo de la base es el de packages/contracts: la semilla los mantiene iguales.
  return rows.flatMap((row) => {
    const code = row.permission.code;
    if (!isPermissionCode(code)) return [];
    const scope = isOwnCondition(row.conditions) ? 'own' : 'all';
    return [{ code, scope }];
  });
}

/** Deja los permisos de un rol personalizado como la lista dada. */
export async function replaceRolePermissions(
  tx: TenantTransaction,
  role: { readonly id: string; readonly tenantId: string },
  wanted: readonly GrantedPermission[],
  now: Date,
): Promise<void> {
  const catalog = await tx.permission.findMany({
    where: { code: { in: wanted.map((item) => item.code) }, deletedAt: null },
    select: { id: true, code: true },
  });
  const idOf = new Map(catalog.map((row) => [row.code, row.id]));
  const current = await tx.rolePermission.findMany({ where: { roleId: role.id } });
  const byPermission = new Map(current.map((row) => [row.permissionId, row]));
  const kept = new Set<string>();
  for (const item of wanted) {
    const permissionId = idOf.get(item.code);
    if (permissionId === undefined) continue;
    kept.add(permissionId);
    const conditions = item.scope === 'own' ? OWN_CONDITION : Prisma.DbNull;
    const existing = byPermission.get(permissionId);
    if (existing === undefined) {
      await tx.rolePermission.create({
        data: { tenantId: role.tenantId, roleId: role.id, permissionId, conditions },
      });
    } else if (
      existing.deletedAt !== null ||
      isOwnCondition(existing.conditions) !== (item.scope === 'own')
    ) {
      await tx.rolePermission.update({
        where: { id: existing.id },
        data: { deletedAt: null, conditions },
      });
    }
  }
  await tx.rolePermission.updateMany({
    where: { roleId: role.id, deletedAt: null, permissionId: { notIn: [...kept] } },
    data: { deletedAt: now },
  });
}

/** La persona tiene hoy este rol: editarlo sería cambiar sus propios permisos. */
export async function holdsRole(
  tx: TenantTransaction,
  userId: string,
  roleId: string,
  now: Date,
): Promise<boolean> {
  const found = await tx.userRole.findFirst({
    where: { userId, roleId, ...activeAssignmentWhere(now) },
    select: { id: true },
  });
  return found !== null;
}

export async function roleNameInUse(
  tx: TenantTransaction,
  name: string,
  exceptRoleId: string | null,
): Promise<boolean> {
  const found = await tx.role.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      deletedAt: null,
      ...(exceptRoleId === null ? {} : { id: { not: exceptRoleId } }),
    },
    select: { id: true },
  });
  return found !== null;
}

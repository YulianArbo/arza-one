import { sodConflictsOf } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { isUnusedAccount } from '../domain/access-policy.js';
import { activeAssignmentWhere } from '../infrastructure/access-store.js';
import { usersWithConfirmedFactor } from '../infrastructure/second-factor-store.js';
import { allUsers, type UserWithRoles } from '../infrastructure/user-directory-store.js';

// Cifras de accesos para el tablero de cumplimiento (B46, decisiones 9 y 10). Salen de las mismas
// lecturas que el informe de revisión de accesos (B45), para que coincidan con él: cuentas
// internas activas sin segundo factor, cuentas sin uso, administradores de la plataforma y
// personas que por sus roles reúnen dos permisos que deben estar en manos distintas.

export interface AccessFigureRow {
  readonly id: string;
  readonly name: string;
  readonly roles: string;
  readonly detail: string;
}

export interface AccessFigures {
  readonly withoutSecondFactor: readonly AccessFigureRow[];
  readonly unused: readonly AccessFigureRow[];
  readonly platformAdmins: readonly AccessFigureRow[];
  readonly sodConflicts: readonly AccessFigureRow[];
}

const PLATFORM_ADMIN = 'ADMIN_PLATAFORMA';

function rowOf(user: UserWithRoles, detail: string): AccessFigureRow {
  return {
    id: user.id,
    name: user.displayName ?? user.email,
    roles: user.roleAssignments.map((assignment) => assignment.role.name).join(', ') || 'Sin roles',
    detail,
  };
}

/** Los permisos de cada rol vigente en la empresa. */
async function permissionsByRole(
  tx: TenantTransaction,
  now: Date,
): Promise<Map<string, ReadonlySet<string>>> {
  const roles = await tx.role.findMany({
    where: { deletedAt: null, assignments: { some: activeAssignmentWhere(now) } },
    select: {
      id: true,
      permissions: {
        where: { deletedAt: null },
        select: { permission: { select: { code: true } } },
      },
    },
  });
  return new Map(
    roles.map((role) => [role.id, new Set(role.permissions.map((item) => item.permission.code))]),
  );
}

function conflictRows(
  users: readonly UserWithRoles[],
  byRole: ReadonlyMap<string, ReadonlySet<string>>,
): AccessFigureRow[] {
  return users.flatMap((user) => {
    const codes = new Set(
      user.roleAssignments.flatMap((assignment) => [...(byRole.get(assignment.roleId) ?? [])]),
    );
    const conflicts = sodConflictsOf(codes);
    if (conflicts.length === 0) return [];
    return [rowOf(user, conflicts.map((conflict) => conflict.label).join('; '))];
  });
}

export async function accessFigures(tx: TenantTransaction, now: Date): Promise<AccessFigures> {
  const accounts = await allUsers(tx, now);
  const active = accounts.filter((user) => user.status === 'active');
  const internal = active.filter((user) => user.kind === 'internal');
  const [confirmed, byRole] = await Promise.all([
    usersWithConfirmedFactor(
      tx,
      internal.map((user) => user.id),
    ),
    permissionsByRole(tx, now),
  ]);
  const lastLogin = (user: UserWithRoles) =>
    user.lastLoginAt === null ? 'Nunca ha ingresado' : 'Sin ingresar en el plazo de la revisión';
  return {
    withoutSecondFactor: internal
      .filter((user) => !confirmed.has(user.id))
      .map((user) => rowOf(user, 'Sin segundo factor')),
    unused: accounts
      .filter((user) => isUnusedAccount(user, now))
      .map((user) => rowOf(user, lastLogin(user))),
    platformAdmins: active
      .filter((user) => user.roleAssignments.some((item) => item.role.code === PLATFORM_ADMIN))
      .map((user) => rowOf(user, 'Administrador de plataforma')),
    sodConflicts: conflictRows(active, byRole),
  };
}

import type { UserListQuery } from '@arza/contracts';

import type { Prisma, Role, User, UserRole } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { activeAssignmentWhere } from './access-store.js';

// Lecturas de la administración de usuarios (B10), dentro de la transacción de la empresa.

export type UserWithRoles = User & { readonly roleAssignments: (UserRole & { role: Role })[] };

function withActiveRoles(now: Date) {
  return {
    roleAssignments: {
      where: activeAssignmentWhere(now),
      include: { role: true },
      orderBy: { role: { name: 'asc' } },
    },
  } as const satisfies Prisma.UserInclude;
}

function listWhere(query: UserListQuery): Prisma.UserWhereInput {
  const search = query.q === undefined || query.q === '' ? undefined : query.q;
  return {
    deletedAt: null,
    kind: query.kind ?? { in: ['internal', 'portal'] },
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(search === undefined
      ? {}
      : {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { displayName: { contains: search, mode: 'insensitive' } },
          ],
        }),
  };
}

/** Una página de usuarios por cursor (numeral 14.1), en orden de creación. */
export async function listUsers(
  tx: TenantTransaction,
  query: UserListQuery,
  now: Date,
): Promise<{ users: UserWithRoles[]; nextCursor: string | null }> {
  const rows = await tx.user.findMany({
    where: listWhere(query),
    include: withActiveRoles(now),
    orderBy: { id: 'asc' },
    take: query.limit + 1,
    ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
  });
  const users = rows.slice(0, query.limit);
  const last = users.at(-1);
  return { users, nextCursor: rows.length > query.limit && last !== undefined ? last.id : null };
}

/** Todas las cuentas de personas de la empresa, para la revisión de accesos. */
export async function allUsers(tx: TenantTransaction, now: Date): Promise<UserWithRoles[]> {
  return tx.user.findMany({
    where: { deletedAt: null, kind: { in: ['internal', 'portal'] } },
    include: withActiveRoles(now),
    orderBy: [{ kind: 'asc' }, { email: 'asc' }],
  });
}

export async function findUserWithRoles(
  tx: TenantTransaction,
  userId: string,
  now: Date,
): Promise<UserWithRoles | null> {
  return tx.user.findFirst({
    where: { id: userId, deletedAt: null, kind: { in: ['internal', 'portal'] } },
    include: withActiveRoles(now),
  });
}

/** Nombre y correo de las personas indicadas (por ejemplo, quién asignó cada rol). */
export async function peopleById(
  tx: TenantTransaction,
  ids: readonly string[],
): Promise<Map<string, Pick<User, 'id' | 'email' | 'displayName'>>> {
  if (ids.length === 0) return new Map();
  const people = await tx.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, email: true, displayName: true },
  });
  return new Map(people.map((person) => [person.id, person]));
}

export async function openSessionCount(
  tx: TenantTransaction,
  userId: string,
  now: Date,
): Promise<number> {
  return tx.session.count({ where: { userId, revokedAt: null, expiresAt: { gt: now } } });
}

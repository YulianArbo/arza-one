import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { activeAssignmentWhere } from './access-store.js';

// Destinatarios de los avisos (B16). Los demás módulos los piden por el índice de iam; nunca leen
// las tablas iam_. Solo cuentan las personas con la cuenta activa: a nadie más se le avisa.

export interface NoticeRecipient {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  /** Los colaboradores (internal) tienen derecho a la desconexión; los del portal, no. */
  readonly collaborator: boolean;
}

const ACTIVE_PEOPLE = { deletedAt: null, status: 'active', kind: { in: ['internal', 'portal'] } };

/** Las personas activas de entre las indicadas. */
export async function noticeRecipients(
  tx: TenantTransaction,
  ids: readonly string[],
): Promise<NoticeRecipient[]> {
  const users = await tx.user.findMany({
    where: { id: { in: [...new Set(ids)] }, ...ACTIVE_PEOPLE },
    select: { id: true, email: true, displayName: true, kind: true },
    orderBy: { id: 'asc' },
  });
  return users.map(({ kind, ...user }) => ({ ...user, collaborator: kind === 'internal' }));
}

/** Colaboradores activos con alguno de los roles indicados, vigente hoy. */
export async function activeUsersWithRoles(
  tx: TenantTransaction,
  roleCodes: readonly string[],
  now: Date,
): Promise<string[]> {
  const users = await tx.user.findMany({
    where: {
      ...ACTIVE_PEOPLE,
      kind: 'internal',
      roleAssignments: {
        some: {
          ...activeAssignmentWhere(now),
          role: { code: { in: [...roleCodes] }, deletedAt: null },
        },
      },
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return users.map((user) => user.id);
}

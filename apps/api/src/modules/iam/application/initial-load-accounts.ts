import type { PermissionCode } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { activeGrants } from '../infrastructure/access-store.js';

// Lo que la carga inicial (B45, módulo de puesta en marcha) pregunta a Identidad: si quien carga
// tiene el permiso completo, qué roles se pueden dar por lote y si un correo ya tiene cuenta. Las
// cuentas se crean con la invitación de siempre (InvitationUseCase), con sus reglas y su auditoría.

/** Roles que nunca se asignan por lote (decisión 3 de B45): se asignan a mano, uno por uno. */
const NOT_BY_LOAD: ReadonlySet<string> = new Set(['ADMIN_PLATAFORMA', 'COLABORADOR']);

export interface LoadableRole {
  readonly id: string;
  readonly code: string;
}

/** Tiene hoy el permiso sin la condición «solo lo propio». */
export async function hasFullPermission(
  tx: TenantTransaction,
  userId: string,
  code: PermissionCode,
  at: Date,
): Promise<boolean> {
  const grants = await activeGrants(tx, userId, at);
  return grants.some((grant) => grant.code === code && !grant.own);
}

/** Roles internos que la carga puede asignar, por código. COLABORADOR llega siempre solo. */
export async function loadableRoles(tx: TenantTransaction): Promise<Map<string, LoadableRole>> {
  const roles = await tx.role.findMany({
    where: { deletedAt: null, audience: 'internal' },
    select: { id: true, code: true },
  });
  return new Map(
    roles.filter((role) => !NOT_BY_LOAD.has(role.code)).map((role) => [role.code, role]),
  );
}

/** El correo ya tiene cuenta en esta empresa (invitada, activa o bloqueada). */
export async function hasAccount(tx: TenantTransaction, email: string): Promise<boolean> {
  return (await tx.user.count({ where: { email, deletedAt: null } })) > 0;
}

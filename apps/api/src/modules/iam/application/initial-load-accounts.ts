import type { PermissionCode } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { activeGrants } from '../infrastructure/access-store.js';
import { usersWithConfirmedFactor } from '../infrastructure/second-factor-store.js';

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

/** Dominios reservados para pruebas (RFC 2606 y 6761): en producción no debe quedar ninguno. */
const RESERVED_DOMAINS =
  /@(?:[^@]+\.)?(?:test|example|invalid|localhost|example\.(?:com|net|org))$/u;

export interface AccountFindings {
  /** Cuentas con correo de un dominio reservado para pruebas (anexo E, punto 22). */
  readonly testAccounts: number;
  /** Cuentas internas activas sin segundo factor confirmado (anexo E, punto 17). */
  readonly withoutSecondFactor: number;
  readonly activeInternal: number;
}

/** Lo que la revisión de puesta en marcha (B45) mira de las cuentas de la empresa. */
export async function accountFindings(tx: TenantTransaction): Promise<AccountFindings> {
  const users = await tx.user.findMany({
    where: { deletedAt: null, kind: { in: ['internal', 'portal'] } },
    select: { id: true, email: true, kind: true, status: true },
  });
  const active = users.filter((user) => user.kind === 'internal' && user.status === 'active');
  const confirmed = await usersWithConfirmedFactor(
    tx,
    active.map((user) => user.id),
  );
  return {
    testAccounts: users.filter((user) => RESERVED_DOMAINS.test(user.email)).length,
    withoutSecondFactor: active.filter((user) => !confirmed.has(user.id)).length,
    activeInternal: active.length,
  };
}

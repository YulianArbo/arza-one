import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { findRoleByCode } from '../infrastructure/assignment-store.js';

// Lo que la administración de empresas (B48) necesita de identidad, siempre dentro del contexto
// de la empresa de que se trata: cuántas cuentas usa del plan, cerrar todas sus sesiones al
// suspenderla y el rol de su primer administrador.

export interface AccountUsage {
  readonly internal: number;
  readonly portal: number;
}

/** Cuentas que cuentan para el plan: las internas y del portal que no están inactivas. */
export async function accountUsage(tx: TenantTransaction): Promise<AccountUsage> {
  const counted = { status: { not: 'inactive' }, deletedAt: null };
  const [internal, portal] = await Promise.all([
    tx.user.count({ where: { ...counted, kind: 'internal' } }),
    tx.user.count({ where: { ...counted, kind: 'portal' } }),
  ]);
  return { internal, portal };
}

/** Cierra todas las sesiones abiertas de la empresa. Devuelve cuántas cerró. */
export async function closeTenantSessions(tx: TenantTransaction, now: Date): Promise<number> {
  const { count } = await tx.session.updateMany({
    where: { revokedAt: null },
    data: { revokedAt: now, revokedReason: 'tenant_suspended' },
  });
  return count;
}

/** Identificador de un rol del sistema de la empresa, o null si no existe. */
export async function systemRoleId(tx: TenantTransaction, code: string): Promise<string | null> {
  return (await findRoleByCode(tx, code))?.id ?? null;
}

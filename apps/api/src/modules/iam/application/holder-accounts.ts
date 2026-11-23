import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Cuentas de un titular para Privacidad (B42, decisión 8): qué cuentas tiene y, al suprimir sus
// datos, la cuenta del portal ya inactiva queda anónima. Una cuenta activa no se toca: primero se
// desactiva. Las cuentas internas son de colaboradores: su historia laboral se conserva.

export interface HolderAccount {
  readonly userId: string;
  readonly kind: 'internal' | 'portal' | 'service';
  readonly status: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly createdAt: Date;
  readonly lastLoginAt: Date | null;
}

export async function accountsOfParty(
  tx: TenantTransaction,
  partyId: string,
): Promise<HolderAccount[]> {
  const users = await tx.user.findMany({ where: { partyId }, orderBy: { createdAt: 'asc' } });
  return users.map((user) => ({
    userId: user.id,
    kind: user.kind === 'portal' ? 'portal' : user.kind === 'service' ? 'service' : 'internal',
    status: user.status,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  }));
}

/** Vuelve anónima una cuenta del portal inactiva; dice si lo hizo. */
export async function anonymizePortalAccount(
  tx: TenantTransaction,
  userId: string,
): Promise<boolean> {
  const { count } = await tx.user.updateMany({
    where: { id: userId, kind: 'portal', status: 'inactive' },
    data: {
      email: `suprimido-${userId}@titular.invalid`,
      displayName: 'Titular suprimido',
      photoFileId: null,
    },
  });
  return count === 1;
}

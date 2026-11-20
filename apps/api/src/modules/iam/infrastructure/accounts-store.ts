import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { User } from '../../../generated/prisma/client.js';
import type { LinkPurpose } from '../domain/link-policy.js';

// Lecturas y escrituras de cuentas, sesiones y enlaces, siempre dentro de la transacción de la
// empresa (la seguridad por fila limita lo que se ve).

export type SessionRevokeReason =
  | 'logout'
  | 'idle'
  | 'password_changed'
  | 'password_reset'
  | 'remote_revoke'
  | 'mfa_failures'
  | 'mfa_changed'
  | 'mfa_reset'
  | 'account_locked'
  | 'offboarding';

export async function loadUser(
  transaction: TenantTransaction,
  userId: string,
): Promise<User | null> {
  return transaction.user.findFirst({ where: { id: userId, deletedAt: null } });
}

export async function revokeSession(
  transaction: TenantTransaction,
  sessionId: string,
  reason: SessionRevokeReason,
  now: Date,
): Promise<void> {
  await transaction.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  });
}

/** Cierra todas las sesiones abiertas de la persona. Devuelve cuántas cerró. */
export async function revokeAllSessions(
  transaction: TenantTransaction,
  userId: string,
  reason: SessionRevokeReason,
  now: Date,
): Promise<number> {
  const { count } = await transaction.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  });
  return count;
}

/** Cierra las demás sesiones abiertas de la persona y deja la indicada. Devuelve cuántas cerró. */
export async function revokeOtherSessions(
  transaction: TenantTransaction,
  owner: { readonly userId: string; readonly keepSessionId: string },
  reason: SessionRevokeReason,
  now: Date,
): Promise<number> {
  const { count } = await transaction.session.updateMany({
    where: { userId: owner.userId, id: { not: owner.keepSessionId }, revokedAt: null },
    data: { revokedAt: now, revokedReason: reason },
  });
  return count;
}

/**
 * Marca el enlace como usado si sigue vigente. Lo hace en una sola sentencia: si dos peticiones
 * llegan a la vez con el mismo enlace, solo una lo consume.
 */
export async function consumeLink(
  transaction: TenantTransaction,
  tokenId: string,
  now: Date,
): Promise<boolean> {
  const { count } = await transaction.token.updateMany({
    where: { id: tokenId, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  return count === 1;
}

/** Vence los enlaces anteriores del mismo propósito: solo el último enviado sirve. */
export async function expirePendingLinks(
  transaction: TenantTransaction,
  userId: string,
  purpose: LinkPurpose,
  now: Date,
): Promise<void> {
  await transaction.token.updateMany({
    where: { userId, purpose, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });
}

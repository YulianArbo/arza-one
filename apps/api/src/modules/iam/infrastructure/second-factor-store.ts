import type { KnownDevice, MfaFactor } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Segundo factor, códigos de recuperación y dispositivos conocidos (B09), siempre dentro de la
// transacción de la empresa. Los secretos llegan y salen cifrados: este archivo nunca los ve.

const TOTP = 'totp';

export async function loadFactor(tx: TenantTransaction, userId: string): Promise<MfaFactor | null> {
  return tx.mfaFactor.findFirst({ where: { userId, type: TOTP, deletedAt: null } });
}

export function isConfirmed(factor: MfaFactor | null): factor is MfaFactor & {
  secretEncrypted: string;
  confirmedAt: Date;
} {
  if (factor === null) return false;
  return factor.secretEncrypted !== null && factor.confirmedAt !== null;
}

export async function hasConfirmedFactor(tx: TenantTransaction, userId: string): Promise<boolean> {
  return isConfirmed(await loadFactor(tx, userId));
}

interface PendingSecret {
  readonly tenantId: string;
  readonly userId: string;
  readonly encrypted: string;
  readonly expiresAt: Date;
}

/** Guarda el secreto en configuración; reemplaza uno anterior sin confirmar. */
export async function storePendingSecret(
  tx: TenantTransaction,
  pending: PendingSecret,
): Promise<MfaFactor> {
  const data = {
    pendingSecretEncrypted: pending.encrypted,
    pendingExpiresAt: pending.expiresAt,
  };
  return tx.mfaFactor.upsert({
    where: {
      tenantId_userId_type: { tenantId: pending.tenantId, userId: pending.userId, type: TOTP },
    },
    create: { tenantId: pending.tenantId, userId: pending.userId, type: TOTP, ...data },
    update: data,
  });
}

/** El secreto en configuración pasa a ser el activo; el primer código ya quedó usado. */
export async function confirmPendingSecret(
  tx: TenantTransaction,
  factor: MfaFactor,
  step: number,
  now: Date,
): Promise<void> {
  await tx.mfaFactor.update({
    where: { id: factor.id },
    data: {
      secretEncrypted: factor.pendingSecretEncrypted,
      confirmedAt: now,
      lastUsedStep: step,
      pendingSecretEncrypted: null,
      pendingExpiresAt: null,
    },
  });
}

/**
 * Marca el paso de tiempo como usado si es posterior al último. En una sola sentencia: si dos
 * peticiones llegan a la vez con el mismo código, solo una lo gasta.
 */
export async function useTotpStep(
  tx: TenantTransaction,
  factorId: string,
  step: number,
): Promise<boolean> {
  const { count } = await tx.mfaFactor.updateMany({
    where: {
      id: factorId,
      OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
    },
    data: { lastUsedStep: step },
  });
  return count === 1;
}

/** Desactiva el segundo factor: borra el secreto activo y el que estuviera en configuración. */
export async function clearFactor(tx: TenantTransaction, userId: string): Promise<boolean> {
  const { count } = await tx.mfaFactor.updateMany({
    where: { userId, type: TOTP, deletedAt: null, confirmedAt: { not: null } },
    data: {
      secretEncrypted: null,
      confirmedAt: null,
      lastUsedStep: null,
      pendingSecretEncrypted: null,
      pendingExpiresAt: null,
    },
  });
  return count === 1;
}

/** Anula los códigos de recuperación que siguen sirviendo. */
export async function revokeRecoveryCodes(
  tx: TenantTransaction,
  userId: string,
  now: Date,
): Promise<void> {
  await tx.recoveryCode.updateMany({
    where: { userId, usedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });
}

/** Reemplaza los códigos de recuperación por los nuevos (solo sus huellas). */
export async function replaceRecoveryCodes(
  tx: TenantTransaction,
  owner: { readonly tenantId: string; readonly userId: string },
  hashes: readonly string[],
  now: Date,
): Promise<void> {
  await revokeRecoveryCodes(tx, owner.userId, now);
  await tx.recoveryCode.createMany({
    data: hashes.map((codeHash) => ({ tenantId: owner.tenantId, userId: owner.userId, codeHash })),
  });
}

/** Gasta un código de recuperación si sirve. En una sola sentencia, como useTotpStep. */
export async function useRecoveryCode(
  tx: TenantTransaction,
  userId: string,
  codeHash: string,
  now: Date,
): Promise<boolean> {
  const { count } = await tx.recoveryCode.updateMany({
    where: { userId, codeHash, usedAt: null, revokedAt: null },
    data: { usedAt: now },
  });
  return count === 1;
}

export async function remainingRecoveryCodes(
  tx: TenantTransaction,
  userId: string,
): Promise<number> {
  return tx.recoveryCode.count({ where: { userId, usedAt: null, revokedAt: null } });
}

export interface DeviceSighting {
  readonly device: KnownDevice;
  /** El equipo no se había visto con esta cuenta, y la cuenta ya tenía otros. */
  readonly isNew: boolean;
}

/**
 * Registra el equipo desde el que la persona entró. El primero de una cuenta no cuenta como
 * nuevo: es el de la activación, y avisar sería ruido.
 */
export async function sightDevice(
  tx: TenantTransaction,
  owner: { readonly tenantId: string; readonly userId: string },
  deviceHash: string,
  userAgent: string | null,
  now: Date,
): Promise<DeviceSighting> {
  const known = await tx.knownDevice.findFirst({
    where: { userId: owner.userId, deviceHash, deletedAt: null },
  });
  if (known !== null) {
    const device = await tx.knownDevice.update({
      where: { id: known.id },
      data: { lastSeenAt: now, userAgent },
    });
    return { device, isNew: false };
  }
  const others = await tx.knownDevice.count({ where: { userId: owner.userId, deletedAt: null } });
  const device = await tx.knownDevice.create({
    data: { ...owner, deviceHash, userAgent, firstSeenAt: now, lastSeenAt: now },
  });
  return { device, isNew: others > 0 };
}

/** El último equipo nuevo de la cuenta, para el correo de aviso. */
export async function latestDevice(
  tx: TenantTransaction,
  userId: string,
): Promise<KnownDevice | null> {
  return tx.knownDevice.findFirst({
    where: { userId, deletedAt: null },
    orderBy: { firstSeenAt: 'desc' },
  });
}

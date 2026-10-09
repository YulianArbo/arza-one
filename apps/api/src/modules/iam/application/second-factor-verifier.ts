import { Inject, Injectable } from '@nestjs/common';
import type { SecondFactorRequest } from '@arza/contracts';

import type { MfaFactor } from '../../../generated/prisma/client.js';
import { FieldCipher } from '../../../platform/crypto/field-cipher.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import {
  newRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from '../infrastructure/recovery-codes.js';
import {
  replaceRecoveryCodes,
  useRecoveryCode,
  useTotpStep,
} from '../infrastructure/second-factor-store.js';
import { matchingTotpStep } from '../infrastructure/totp.js';
import { RECOVERY_CODE_COUNT } from '../domain/second-factor-policy.js';

export type VerificationMethod = 'totp' | 'recovery_code';

interface FactorOwner {
  readonly tenantId: string;
  readonly userId: string;
}

/**
 * Verifica los códigos del segundo factor. El secreto se descifra solo aquí, en memoria, y nunca
 * sale de este servicio. Cada código sirve una sola vez.
 */
@Injectable()
export class SecondFactorVerifier {
  constructor(@Inject(FieldCipher) private readonly cipher: FieldCipher) {}

  /** El secreto queda atado a su empresa y su persona: copiado a otra fila no descifra. */
  private context(owner: FactorOwner): string {
    return `iam_mfa_factors:${owner.tenantId}:${owner.userId}`;
  }

  encryptSecret(secret: string, owner: FactorOwner): string {
    return this.cipher.encrypt(secret, this.context(owner));
  }

  decryptSecret(encrypted: string, owner: FactorOwner): string {
    return this.cipher.decrypt(encrypted, this.context(owner));
  }

  /** Paso de tiempo del código si coincide con el secreto dado (cifrado). */
  stepFor(encrypted: string, owner: FactorOwner, code: string, now: Date): number | null {
    return matchingTotpStep(this.decryptSecret(encrypted, owner), code, now);
  }

  /**
   * Comprueba el código del celular o un código de recuperación contra el factor activo, y lo
   * gasta. Devuelve con qué se verificó, o null si no sirvió.
   */
  async verify(
    tx: TenantTransaction,
    factor: MfaFactor & { secretEncrypted: string },
    proof: SecondFactorRequest,
    now: Date,
  ): Promise<VerificationMethod | null> {
    if (proof.code !== undefined) {
      const step = this.stepFor(factor.secretEncrypted, factor, proof.code, now);
      return step !== null && (await useTotpStep(tx, factor.id, step)) ? 'totp' : null;
    }
    const code = normalizeRecoveryCode(proof.recovery_code ?? '');
    if (code === null) return null;
    return (await useRecoveryCode(tx, factor.userId, hashRecoveryCode(code), now))
      ? 'recovery_code'
      : null;
  }

  /** Diez códigos de recuperación nuevos; los anteriores dejan de servir. */
  async issueRecoveryCodes(
    tx: TenantTransaction,
    owner: FactorOwner,
    now: Date,
  ): Promise<string[]> {
    const codes = newRecoveryCodes(RECOVERY_CODE_COUNT);
    await replaceRecoveryCodes(tx, owner, codes.map(hashRecoveryCode), now);
    return codes;
  }
}

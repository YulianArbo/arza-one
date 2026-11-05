import { randomInt } from 'node:crypto';

import type { PublicSignatureState, SignerStatus } from '@arza/contracts';

// Reglas puras de la firma electrónica (B25, capítulo 19): el turno de cada firmante, lo que ve
// quien abre el enlace, el último instante del plazo, el código de verificación y el correo oculto.

const BOGOTA_OFFSET_HOURS = 5;

/** Último instante del día en Colombia: el plazo vence a las 11:59 p. m. de ese día. */
export function endOfBogotaDay(date: string): Date {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1, BOGOTA_OFFSET_HOURS) - 1);
}

interface TurnSigner {
  readonly id: string;
  readonly signOrder: number;
  readonly status: SignerStatus;
}

/** A quién le toca: el primero, en orden, que no ha firmado. null si ya firmaron todos. */
export function signerOnTurn<T extends TurnSigner>(signers: readonly T[]): T | null {
  const ordered = [...signers].sort((a, b) => a.signOrder - b.signOrder);
  return ordered.find((signer) => signer.status !== 'signed') ?? null;
}

/** Lo que ve en su enlace quien firma, según el proceso y su propio estado. */
export function publicStateOf(
  envelopeStatus: string,
  signerStatus: SignerStatus,
): PublicSignatureState {
  if (envelopeStatus === 'completed') return 'completed';
  if (signerStatus === 'signed') return envelopeStatus === 'sent' ? 'signed' : 'closed';
  if (signerStatus === 'rejected') return 'rejected';
  if (envelopeStatus !== 'sent') return 'closed';
  return signerStatus === 'pending' ? 'pending' : 'waiting';
}

/** Sin letras ni números que se confundan al leerlos (0 y O, 1 e I). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código de verificación pública del documento firmado: XXXX-XXXX-XXXX. */
export function newVerificationCode(): string {
  const groups = Array.from({ length: 3 }, () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(''),
  );
  return groups.join('-');
}

/** Código de un solo uso de seis números para el correo (numeral 19.2). */
export function newSignatureCode(): string {
  return String(randomInt(1_000_000)).padStart(6, '0');
}

/** El correo con parte oculta, para que quien abre el enlace sepa a dónde llegó el código. */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  const visible = user.slice(0, Math.min(2, Math.max(1, user.length - 1)));
  return `${visible}***@${domain}`;
}

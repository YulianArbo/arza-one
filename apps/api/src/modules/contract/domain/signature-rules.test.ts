import { describe, expect, it } from 'vitest';

import {
  endOfBogotaDay,
  maskEmail,
  newSignatureCode,
  newVerificationCode,
  publicStateOf,
  signerOnTurn,
} from './signature-rules.js';

describe('reglas de la firma electrónica', () => {
  it('el plazo vence a las 11:59:59.999 p. m. de Colombia de su último día', () => {
    expect(endOfBogotaDay('2026-11-14').toISOString()).toBe('2026-11-15T04:59:59.999Z');
  });

  it('le toca al primero en orden que no ha firmado; la empresa firma de última', () => {
    const signers = [
      { id: 'empresa', signOrder: 3, status: 'waiting' as const },
      { id: 'cliente-2', signOrder: 2, status: 'pending' as const },
      { id: 'cliente-1', signOrder: 1, status: 'signed' as const },
    ];
    expect(signerOnTurn(signers)?.id).toBe('cliente-2');
    expect(signerOnTurn(signers.map((signer) => ({ ...signer, status: 'signed' as const })))).toBe(
      null,
    );
  });

  it('lo que ve quien abre el enlace', () => {
    expect(publicStateOf('sent', 'pending')).toBe('pending');
    expect(publicStateOf('sent', 'waiting')).toBe('waiting');
    expect(publicStateOf('sent', 'signed')).toBe('signed');
    expect(publicStateOf('completed', 'signed')).toBe('completed');
    expect(publicStateOf('rejected', 'rejected')).toBe('rejected');
    expect(publicStateOf('rejected', 'waiting')).toBe('closed');
    expect(publicStateOf('expired', 'pending')).toBe('closed');
    expect(publicStateOf('cancelled', 'signed')).toBe('closed');
  });
});

describe('códigos de la firma electrónica', () => {
  it('el código de verificación tiene la forma XXXX-XXXX-XXXX, sin letras que se confundan', () => {
    for (let index = 0; index < 50; index += 1) {
      expect(newVerificationCode()).toMatch(
        /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/,
      );
    }
  });

  it('el código del correo tiene seis números', () => {
    for (let index = 0; index < 50; index += 1) expect(newSignatureCode()).toMatch(/^[0-9]{6}$/);
  });

  it('oculta el correo sin perder el dominio', () => {
    expect(maskEmail('ana.perez@cliente.test')).toBe('an***@cliente.test');
    expect(maskEmail('ab@cliente.test')).toBe('a***@cliente.test');
    expect(maskEmail('a@cliente.test')).toBe('a***@cliente.test');
  });
});

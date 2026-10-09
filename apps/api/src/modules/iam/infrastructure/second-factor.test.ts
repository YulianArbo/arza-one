import { Secret } from 'otpauth';
import { describe, expect, it } from 'vitest';

import { hashRecoveryCode, newRecoveryCodes, normalizeRecoveryCode } from './recovery-codes.js';
import { matchingTotpStep, newTotpSecret, totpCodeAt, totpUri } from './totp.js';

// Semilla pública de los vectores de prueba del RFC 6238 (anexo B), en base32.
const RFC_SECRET = Secret.fromUTF8('12345678901234567890').base32;

function at(seconds: number): Date {
  return new Date(seconds * 1000);
}

describe('códigos TOTP (RFC 6238)', () => {
  // Los vectores oficiales son de 8 dígitos; los de 6 son sus últimos seis.
  it.each([
    [59, '287082'],
    [1_111_111_109, '081804'],
    [1_111_111_111, '050471'],
    [1_234_567_890, '005924'],
    [2_000_000_000, '279037'],
  ])('en el segundo %i el código es %s', (seconds, code) => {
    expect(totpCodeAt(RFC_SECRET, at(seconds))).toBe(code);
    expect(matchingTotpStep(RFC_SECRET, code, at(seconds))).toBe(Math.floor(seconds / 30));
  });

  it('acepta el código anterior y el siguiente por diferencias de reloj, no más', () => {
    const now = at(1_234_567_890);
    const step = Math.floor(1_234_567_890 / 30);
    const previous = totpCodeAt(RFC_SECRET, at(1_234_567_890 - 30));
    const next = totpCodeAt(RFC_SECRET, at(1_234_567_890 + 30));
    const tooOld = totpCodeAt(RFC_SECRET, at(1_234_567_890 - 60));
    expect(matchingTotpStep(RFC_SECRET, previous, now)).toBe(step - 1);
    expect(matchingTotpStep(RFC_SECRET, next, now)).toBe(step + 1);
    expect(matchingTotpStep(RFC_SECRET, tooOld, now)).toBeNull();
  });

  it('rechaza un código equivocado', () => {
    expect(matchingTotpStep(RFC_SECRET, '000000', at(59))).toBeNull();
  });

  it('cada secreto nuevo es distinto y tiene 160 bits en base32', () => {
    const first = newTotpSecret();
    expect(first).toMatch(/^[A-Z2-7]{32}$/);
    expect(newTotpSecret()).not.toBe(first);
  });

  it('la dirección del código QR identifica a ARZA ONE y a la cuenta', () => {
    const uri = totpUri(RFC_SECRET, 'ana@demo-uno.test');
    expect(uri).toMatch(/^otpauth:\/\/totp\/ARZA%20ONE:ana%40demo-uno\.test\?/);
    expect(uri).toContain('issuer=ARZA%20ONE');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});

describe('códigos de recuperación', () => {
  it('se generan diez distintos, en grupos de cuatro y sin letras que se confunden', () => {
    const codes = newRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^([A-HJKMNP-Z2-9]{4}-){3}[A-HJKMNP-Z2-9]{4}$/);
  });

  it('acepta lo escrito con minúsculas, espacios o sin guiones', () => {
    expect(normalizeRecoveryCode(' abcd-efgh jkmn-pqrs ')).toBe('ABCDEFGHJKMNPQRS');
    expect(hashRecoveryCode('abcd efgh jkmn pqrs')).toBe(hashRecoveryCode('ABCD-EFGH-JKMN-PQRS'));
  });

  it('descarta lo que no tiene la forma de un código', () => {
    expect(normalizeRecoveryCode('ABCD-EFGH-JKMN')).toBeNull();
    expect(normalizeRecoveryCode('ABCD-EFGH-JKMN-PQR0')).toBeNull();
    expect(normalizeRecoveryCode('ABCD-EFGH-JKMN-PQRS-T')).toBeNull();
  });

  it('solo se guarda su huella, que no contiene el código', () => {
    const hash = hashRecoveryCode('ABCD-EFGH-JKMN-PQRS');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('ABCD');
  });
});

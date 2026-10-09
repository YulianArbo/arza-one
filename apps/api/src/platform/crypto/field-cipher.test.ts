import { describe, expect, it } from 'vitest';

import { FieldCipher, FieldCipherError } from './field-cipher.js';

// Llaves ficticias, solo para estas pruebas.
const KEY = 'prueba-'.repeat(6);
const OTHER_KEY = 'otra-'.repeat(9);

describe('cifrado de campos', () => {
  const cipher = new FieldCipher(KEY);

  it('descifra lo que cifró con el mismo contexto', () => {
    const stored = cipher.encrypt('JBSWY3DPEHPK3PXP', 'iam_mfa_factors:a:b');
    expect(cipher.decrypt(stored, 'iam_mfa_factors:a:b')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('el valor guardado no contiene el texto original y cambia en cada cifrado', () => {
    const first = cipher.encrypt('JBSWY3DPEHPK3PXP', 'contexto');
    const second = cipher.encrypt('JBSWY3DPEHPK3PXP', 'contexto');
    expect(first).not.toContain('JBSWY3DPEHPK3PXP');
    expect(first).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(first).not.toBe(second);
  });

  it('con otra llave no descifra', () => {
    const stored = cipher.encrypt('secreto', 'contexto');
    expect(() => new FieldCipher(OTHER_KEY).decrypt(stored, 'contexto')).toThrow(FieldCipherError);
  });

  it('con otro contexto no descifra: el valor no sirve copiado a otra fila', () => {
    const stored = cipher.encrypt('secreto', 'iam_mfa_factors:empresa-a:usuario-1');
    expect(() => cipher.decrypt(stored, 'iam_mfa_factors:empresa-a:usuario-2')).toThrow(
      FieldCipherError,
    );
  });

  it('un valor alterado o con otro formato no descifra', () => {
    const stored = cipher.encrypt('secreto', 'contexto');
    const tampered = `${stored.slice(0, -2)}AA`;
    expect(() => cipher.decrypt(tampered, 'contexto')).toThrow(FieldCipherError);
    expect(() => cipher.decrypt('texto-plano', 'contexto')).toThrow(FieldCipherError);
    expect(() => cipher.decrypt(stored.replace('v1.', 'v9.'), 'contexto')).toThrow(
      FieldCipherError,
    );
  });
});

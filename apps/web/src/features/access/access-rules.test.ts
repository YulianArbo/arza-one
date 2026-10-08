import { describe, expect, it } from 'vitest';

import { tokenFromHash } from './link-token';
import { confirmationError, newPasswordError } from './password-checks';

describe('contraseña nueva en la web', () => {
  it('pide al menos 12 caracteres y como máximo 128', () => {
    expect(newPasswordError('corta')).toBe('Escriba al menos 12 caracteres.');
    expect(newPasswordError('x'.repeat(129))).toBe('Use como máximo 128 caracteres.');
    expect(newPasswordError('una frase propia')).toBeNull();
  });

  it('exige que las dos coincidan', () => {
    expect(confirmationError('una frase propia', 'otra frase')).toBe(
      'Las dos contraseñas no coinciden.',
    );
    expect(confirmationError('una frase propia', 'una frase propia')).toBeNull();
  });
});

describe('llave del enlace del correo', () => {
  it('la toma de lo que va después de #token=', () => {
    expect(tokenFromHash(`#token=${'a'.repeat(43)}`)).toBe('a'.repeat(43));
  });

  it('descarta un enlace incompleto o alterado', () => {
    expect(tokenFromHash('')).toBeNull();
    expect(tokenFromHash('#token=corta')).toBeNull();
    expect(tokenFromHash(`#token=${'a'.repeat(42)}%27`)).toBeNull();
  });
});

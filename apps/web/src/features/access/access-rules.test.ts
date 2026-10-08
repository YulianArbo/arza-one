import { describe, expect, it } from 'vitest';

import { forgetLinkToken, readLinkToken, tokenFromHash } from './link-token';
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

describe('lectura de la llave cuando la pantalla se vuelve a montar', () => {
  function fakeWindow(path: string, hash: string) {
    const location = { pathname: path, hash } as Location;
    const history = {
      replaceState: (_state: unknown, _title: string, url: string) => {
        location.hash = '';
        location.pathname = url;
      },
    } as History;
    return { location, history };
  }

  it('la quita de la dirección y la sigue entregando en el segundo montaje', () => {
    forgetLinkToken();
    const { location, history } = fakeWindow('/activar-cuenta', '#token=' + 'a'.repeat(43));
    expect(readLinkToken(location, history)).toBe('a'.repeat(43));
    expect(location.hash).toBe('');
    expect(readLinkToken(location, history)).toBe('a'.repeat(43));
  });

  it('después de usarla, o en otra pantalla, ya no la entrega', () => {
    const { location, history } = fakeWindow('/activar-cuenta', '#token=' + 'b'.repeat(43));
    readLinkToken(location, history);
    forgetLinkToken();
    expect(readLinkToken(location, history)).toBeNull();
    const other = fakeWindow('/restablecer-contrasena', '');
    expect(readLinkToken(other.location, other.history)).toBeNull();
  });
});

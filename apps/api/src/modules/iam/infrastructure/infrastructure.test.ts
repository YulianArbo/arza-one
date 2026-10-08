import { describe, expect, it } from 'vitest';

import { isLeakedPassword } from './leaked-passwords.js';
import { hashPassword, verifyPassword } from './password-hasher.js';
import { csrfTokenFor, hashSecretToken, newSecretToken } from './secret-token.js';

const PHC = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/;

describe('huella de contraseñas con Argon2id', () => {
  it('guarda el formato PHC con los parámetros de OWASP y una sal propia', async () => {
    const first = await hashPassword('una frase larga y propia');
    const second = await hashPassword('una frase larga y propia');
    expect(first).toMatch(PHC);
    expect(first).not.toBe(second);
  });

  it('reconoce la contraseña correcta y rechaza otra', async () => {
    const stored = await hashPassword('una frase larga y propia');
    await expect(verifyPassword('una frase larga y propia', stored)).resolves.toBe(true);
    await expect(verifyPassword('una frase larga y PROPIA', stored)).resolves.toBe(false);
  });

  it('una huella con formato desconocido nunca coincide', async () => {
    await expect(verifyPassword('lo que sea', '$2b$10$bcrypt')).resolves.toBe(false);
  });

  it('una huella con parámetros que Argon2 no acepta nunca coincide', async () => {
    const stored = await hashPassword('una frase larga y propia');
    const tampered = stored.replace('m=19456', 'm=1');
    await expect(verifyPassword('una frase larga y propia', tampered)).resolves.toBe(false);
  });
});

describe('lista de contraseñas filtradas', () => {
  it('reconoce contraseñas conocidas sin importar las mayúsculas', () => {
    expect(isLeakedPassword('123456789012')).toBe(true);
    expect(isLeakedPassword('QWERTYUIOPASDFGHJKL')).toBe(true);
  });

  it('no rechaza una frase propia', () => {
    expect(isLeakedPassword('el gato de Mariela come mango')).toBe(false);
  });
});

describe('llaves de sesión y de enlaces', () => {
  it('genera 256 bits al azar y guarda solo su huella SHA-256', () => {
    const first = newSecretToken();
    const second = newSecretToken();
    expect(first.token).toMatch(/^[\w-]{43}$/);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).toBe(hashSecretToken(first.token));
    expect(first.token).not.toBe(second.token);
  });

  it('el código antifalsificación depende de la sesión y del secreto', () => {
    const code = csrfTokenFor('sesion-1', 'secreto-a');
    expect(code).toBe(csrfTokenFor('sesion-1', 'secreto-a'));
    expect(code).not.toBe(csrfTokenFor('sesion-2', 'secreto-a'));
    expect(code).not.toBe(csrfTokenFor('sesion-1', 'secreto-b'));
  });
});

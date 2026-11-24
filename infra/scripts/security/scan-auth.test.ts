import { describe, expect, it } from 'vitest';

import {
  SESSION_ROUTES,
  invitationToken,
  sessionCookie,
  totpCode,
  withoutSessionRoutes,
} from './scan-auth.ts';

describe('código del segundo factor de la cuenta de análisis', () => {
  // Vectores del anexo B del RFC 6238 (SHA-1), recortados a seis dígitos.
  const rfcSecret = Buffer.from('12345678901234567890');

  it('coincide con los vectores del estándar', () => {
    expect(totpCode(rfcSecret, new Date(59_000))).toBe('287082');
    expect(totpCode(rfcSecret, new Date(1_111_111_109_000))).toBe('081804');
    expect(totpCode(rfcSecret, new Date(2_000_000_000_000))).toBe('279037');
  });

  it('acepta el secreto en base32, como lo entrega la API', () => {
    const base32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(totpCode(base32, new Date(59_000))).toBe('287082');
    expect(totpCode(`${base32.toLowerCase()}==`, new Date(59_000))).toBe('287082');
  });

  it('rechaza un secreto que no es base32', () => {
    expect(() => totpCode('NO-ES-BASE32!', new Date())).toThrow('base32');
  });
});

describe('correo de invitación', () => {
  const token = 'a'.repeat(40) + '-_b';

  it('toma la llave del enlace de activación', () => {
    const text = `Abra este enlace:\nhttp://web:3000/activar-cuenta#token=${token}\nGracias`;
    expect(invitationToken(text)).toBe(token);
  });

  it('falla si el correo no trae el enlace', () => {
    expect(() => invitationToken('Hola')).toThrow('enlace de activación');
  });
});

describe('cookie de sesión', () => {
  it('devuelve solo nombre y valor de la cookie pedida', () => {
    const headers = [
      '__Host-arza_device=d; Path=/; HttpOnly',
      '__Host-arza_session=abc123; Path=/; HttpOnly; Secure; SameSite=Lax',
    ];
    expect(sessionCookie(headers, '__Host-arza_session')).toBe('__Host-arza_session=abc123');
    expect(sessionCookie([], '__Host-arza_session')).toBeUndefined();
  });
});

describe('OpenAPI del análisis', () => {
  it('quita las rutas que cerrarían la sesión y deja las demás', () => {
    const document = {
      openapi: '3.1.0',
      paths: {
        '/v1/auth/logout': {},
        '/v1/auth/session': {},
        '/v1/me/sessions/revoke-others': {},
        '/v1/me/mfa/disable': {},
        '/v1/me/password': {},
        '/v1/me': {},
        '/v1/me/photo': {},
        '/v1/parties': {},
      },
    };
    const filtered = withoutSessionRoutes(document, SESSION_ROUTES);
    expect(Object.keys(filtered.paths ?? {})).toEqual(['/v1/me', '/v1/me/photo', '/v1/parties']);
    expect(filtered['openapi']).toBe('3.1.0');
  });

  it('tolera un documento sin rutas', () => {
    expect(withoutSessionRoutes({}, SESSION_ROUTES).paths).toEqual({});
  });
});

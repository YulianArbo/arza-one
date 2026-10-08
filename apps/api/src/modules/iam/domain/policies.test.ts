import { describe, expect, it } from 'vitest';

import { linkExpiresAt } from './link-policy.js';
import { newPasswordProblem } from './password-policy.js';
import { isIdleExpired, sessionExpiresAt, shouldTouch } from './session-policy.js';
import { canSignIn } from './user.js';

const NOW = new Date('2026-10-09T15:00:00Z');
const HOUR = 60 * 60 * 1000;

function later(milliseconds: number): Date {
  return new Date(NOW.getTime() + milliseconds);
}

describe('vencimiento de la sesión (numeral 15.1)', () => {
  it('vence a las 12 horas en total', () => {
    expect(sessionExpiresAt(NOW)).toEqual(later(12 * HOUR));
  });

  it('vence a las 8 horas sin uso', () => {
    expect(isIdleExpired(NOW, later(8 * HOUR - 1))).toBe(false);
    expect(isIdleExpired(NOW, later(8 * HOUR))).toBe(true);
  });

  it('guarda la actividad como mucho una vez por minuto', () => {
    expect(shouldTouch(NOW, later(59_000))).toBe(false);
    expect(shouldTouch(NOW, later(60_000))).toBe(true);
  });
});

describe('vigencia de los enlaces (numeral 15.1)', () => {
  it('la invitación vence en 72 horas', () => {
    expect(linkExpiresAt('invitation', NOW)).toEqual(later(72 * HOUR));
  });

  it('la recuperación vence en 30 minutos', () => {
    expect(linkExpiresAt('password_reset', NOW)).toEqual(later(HOUR / 2));
  });
});

describe('contraseña nueva (numeral 15.1)', () => {
  const neverLeaked = (): boolean => false;

  it('exige al menos 12 caracteres, sin reglas de composición', () => {
    expect(newPasswordProblem('corta', neverLeaked)).toBe('too_short');
    expect(newPasswordProblem('solo minusculas largas', neverLeaked)).toBeNull();
  });

  it('cuenta caracteres, no bytes: las tildes y los emojis cuentan como uno', () => {
    expect(newPasswordProblem('ñandú🦜ñandú', neverLeaked)).toBe('too_short');
    expect(newPasswordProblem('ñandú🦜ñandú🦜', neverLeaked)).toBeNull();
  });

  it('no admite más de 128 caracteres', () => {
    expect(newPasswordProblem('a'.repeat(129), neverLeaked)).toBe('too_long');
  });

  it('rechaza las contraseñas filtradas', () => {
    expect(newPasswordProblem('una frase filtrada', () => true)).toBe('breached');
  });
});

describe('quién puede iniciar sesión', () => {
  it('solo una cuenta activa de persona', () => {
    expect(canSignIn({ status: 'active', kind: 'internal' })).toBe(true);
    expect(canSignIn({ status: 'active', kind: 'portal' })).toBe(true);
    expect(canSignIn({ status: 'active', kind: 'service' })).toBe(false);
    for (const status of ['invited', 'locked', 'inactive']) {
      expect(canSignIn({ status, kind: 'internal' })).toBe(false);
    }
  });
});

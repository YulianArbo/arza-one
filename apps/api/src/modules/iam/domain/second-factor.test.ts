import { describe, expect, it } from 'vitest';

import { describeDevice } from './device.js';
import {
  isRecentlyVerified,
  needsSecondFactor,
  pendingSignInExpiresAt,
  secondFactorRequired,
  setupExpiresAt,
  signInStage,
} from './second-factor-policy.js';

const NOW = new Date('2026-10-09T15:00:00Z');
const MINUTE = 60 * 1000;

function later(milliseconds: number): Date {
  return new Date(NOW.getTime() + milliseconds);
}

describe('obligatoriedad del segundo factor (numeral 15.1)', () => {
  it('es obligatorio para todo usuario interno, aunque la marca diga lo contrario', () => {
    expect(secondFactorRequired({ kind: 'internal', mfaRequired: false })).toBe(true);
    expect(secondFactorRequired({ kind: 'internal', mfaRequired: true })).toBe(true);
  });

  it('en el portal depende de la marca (administradores de cliente)', () => {
    expect(secondFactorRequired({ kind: 'portal', mfaRequired: true })).toBe(true);
    expect(secondFactorRequired({ kind: 'portal', mfaRequired: false })).toBe(false);
  });

  it('quien lo activó por su cuenta lo usa siempre', () => {
    expect(needsSecondFactor({ kind: 'portal', mfaRequired: false }, true)).toBe(true);
    expect(needsSecondFactor({ kind: 'portal', mfaRequired: false }, false)).toBe(false);
  });
});

describe('etapa del inicio de sesión', () => {
  it('completa cuando la sesión ya pasó el segundo paso', () => {
    expect(signInStage(NOW, true)).toBe('complete');
    expect(signInStage(NOW, false)).toBe('complete');
  });

  it('pide el código a quien tiene segundo factor y la configuración a quien no', () => {
    expect(signInStage(null, true)).toBe('second_factor');
    expect(signInStage(null, false)).toBe('second_factor_setup');
  });

  it('el segundo paso vence a los 10 minutos y la configuración a los 15', () => {
    expect(pendingSignInExpiresAt(NOW)).toEqual(later(10 * MINUTE));
    expect(setupExpiresAt(NOW)).toEqual(later(15 * MINUTE));
  });
});

describe('confirmación de identidad para acciones de alto riesgo', () => {
  it('vale 30 minutos', () => {
    expect(isRecentlyVerified(NOW, later(30 * MINUTE - 1))).toBe(true);
    expect(isRecentlyVerified(NOW, later(30 * MINUTE))).toBe(false);
  });

  it('sin confirmación no vale', () => {
    expect(isRecentlyVerified(null, NOW)).toBe(false);
  });
});

describe('descripción del dispositivo', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      'Chrome',
      'Windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      'Edge',
      'Windows',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
      'Safari',
      'macOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
      'Safari',
      'iOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
      'Chrome',
      'Android',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0', 'Firefox', 'Linux'],
  ])('%s', (userAgent, browser, os) => {
    expect(describeDevice(userAgent)).toEqual({ browser, os });
  });

  it('sin información o desconocido queda vacío', () => {
    expect(describeDevice(null)).toEqual({ browser: null, os: null });
    expect(describeDevice('curl/8.10.1')).toEqual({ browser: null, os: null });
  });
});

import { describe, expect, it } from 'vitest';

import {
  delayAfterFailures,
  lockedUntil,
  loginGate,
  type RecentFailures,
} from './login-throttle.js';

const NOW = new Date('2026-10-09T15:00:00Z');
const NO_FAILURES: RecentFailures = { count: 0, lastFailureAt: null };

function secondsAgo(seconds: number): Date {
  return new Date(NOW.getTime() - seconds * 1000);
}

function failures(count: number, lastSecondsAgo: number): RecentFailures {
  return { count, lastFailureAt: secondsAgo(lastSecondsAgo) };
}

describe('espera progresiva (numeral 15.1)', () => {
  it('dobla la espera con cada fallo: 1, 2, 4 y 8 segundos', () => {
    expect([0, 1, 2, 3, 4].map(delayAfterFailures)).toEqual([0, 1, 2, 4, 8]);
  });

  it('sin fallos deja intentar', () => {
    expect(loginGate(NO_FAILURES, null, NOW)).toEqual({ kind: 'open' });
  });

  it('obliga a esperar si el intento llega antes de tiempo', () => {
    expect(loginGate(failures(3, 1), null, NOW)).toEqual({
      kind: 'delayed',
      retryAfterSeconds: 3,
    });
  });

  it('deja intentar cuando ya pasó la espera', () => {
    expect(loginGate(failures(4, 8), null, NOW)).toEqual({ kind: 'open' });
  });
});

describe('bloqueo de 15 minutos al quinto fallo', () => {
  it('bloquea durante 15 minutos desde el quinto fallo', () => {
    expect(lockedUntil(failures(5, 0))).toEqual(new Date(NOW.getTime() + 15 * 60 * 1000));
    expect(loginGate(failures(5, 60), null, NOW)).toEqual({
      kind: 'locked',
      retryAfterSeconds: 840,
    });
  });

  it('cuatro fallos no bloquean', () => {
    expect(lockedUntil(failures(4, 0))).toBeNull();
  });

  it('el bloqueo termina a los 15 minutos', () => {
    expect(loginGate(failures(5, 15 * 60), null, NOW)).toEqual({ kind: 'open' });
  });

  it('respeta el bloqueo guardado en la cuenta aunque no haya fallos recientes', () => {
    const accountLock = new Date(NOW.getTime() + 90_000);
    expect(loginGate(NO_FAILURES, accountLock, NOW)).toEqual({
      kind: 'locked',
      retryAfterSeconds: 90,
    });
  });

  it('ignora un bloqueo de la cuenta que ya venció', () => {
    expect(loginGate(NO_FAILURES, secondsAgo(1), NOW)).toEqual({ kind: 'open' });
  });
});

import { describe, expect, it } from 'vitest';

import {
  DEVICE_COOKIE,
  SESSION_COOKIE,
  deviceTokenFrom,
  sessionTokenFrom,
} from './session-cookie.js';

const TOKEN = 'a'.repeat(43);

describe('lectura de la cookie de sesión', () => {
  it('encuentra la llave entre otras cookies', () => {
    expect(sessionTokenFrom(`arza_theme=dark; ${SESSION_COOKIE}=${TOKEN}; otra=1`)).toBe(TOKEN);
  });

  it('sin cookie, o sin la de sesión, no hay llave', () => {
    expect(sessionTokenFrom(undefined)).toBeNull();
    expect(sessionTokenFrom('arza_theme=dark; sin-igual')).toBeNull();
  });

  it('descarta un valor con formato distinto al de una llave', () => {
    expect(sessionTokenFrom(`${SESSION_COOKIE}=corta`)).toBeNull();
    expect(sessionTokenFrom(`${SESSION_COOKIE}=${'a'.repeat(42)}%27`)).toBeNull();
  });
});

describe('lectura de la marca del dispositivo', () => {
  it('la encuentra junto a la cookie de sesión, sin confundirlas', () => {
    const header = `${SESSION_COOKIE}=${TOKEN}; ${DEVICE_COOKIE}=${'b'.repeat(43)}`;
    expect(deviceTokenFrom(header)).toBe('b'.repeat(43));
    expect(sessionTokenFrom(header)).toBe(TOKEN);
  });

  it('sin marca, o con otro formato, no hay dispositivo conocido', () => {
    expect(deviceTokenFrom(`${SESSION_COOKIE}=${TOKEN}`)).toBeNull();
    expect(deviceTokenFrom(`${DEVICE_COOKIE}=corta`)).toBeNull();
  });
});

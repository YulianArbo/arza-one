import { describe, expect, it } from 'vitest';

import { SESSION_COOKIE, sessionTokenFrom } from './session-cookie.js';

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

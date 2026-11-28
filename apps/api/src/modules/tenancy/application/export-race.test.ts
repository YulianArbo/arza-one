import { describe, expect, it } from 'vitest';

import { LostToOtherPass, unlessLost } from './export-race.js';

describe('dos pasadas sobre la misma exportación (B49)', () => {
  it('devuelve el resultado cuando esta pasada gana', async () => {
    await expect(unlessLost(() => Promise.resolve('lista'), 'perdida')).resolves.toBe('lista');
  });

  it('devuelve el valor de «perdida» cuando otra pasada ganó', async () => {
    const lost = unlessLost(() => Promise.reject(new LostToOtherPass()), null);
    await expect(lost).resolves.toBeNull();
  });

  it('deja pasar cualquier otro error', async () => {
    const broken = unlessLost(() => Promise.reject(new Error('Base de datos caída')), false);
    await expect(broken).rejects.toThrow('Base de datos caída');
  });
});

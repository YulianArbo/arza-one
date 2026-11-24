import { describe, expect, it } from 'vitest';

import { AppError } from '../errors/app-error.js';
import { NullCharacterPipe, hasNullCharacter } from './null-character.pipe.js';

const NUL = String.fromCharCode(0);

describe('carácter nulo en la petición (B43)', () => {
  it('lo encuentra en textos, listas, objetos anidados y nombres de campo', () => {
    expect(hasNullCharacter(`a${NUL}b`)).toBe(true);
    expect(hasNullCharacter(['ok', [`x${NUL}`]])).toBe(true);
    expect(hasNullCharacter({ a: { b: `c${NUL}` } })).toBe(true);
    expect(hasNullCharacter({ [`k${NUL}`]: 'v' })).toBe(true);
  });

  it('no lo ve en datos normales ni en valores que no son texto', () => {
    expect(hasNullCharacter({ a: 'ñandú', b: [1, true, null], c: undefined })).toBe(false);
    expect(hasNullCharacter(42)).toBe(false);
  });

  it('no recorre más allá de la profundidad máxima', () => {
    let deep: unknown = `x${NUL}`;
    for (let level = 0; level < 40; level += 1) deep = { deep };
    expect(hasNullCharacter(deep)).toBe(false);
  });

  it('el filtro rechaza el cuerpo, la consulta y la ruta, y deja pasar lo demás', () => {
    const pipe = new NullCharacterPipe();
    for (const type of ['body', 'query', 'param'] as const) {
      expect(() => pipe.transform({ q: NUL }, { type })).toThrow(AppError);
    }
    expect(pipe.transform({ q: NUL }, { type: 'custom' })).toEqual({ q: NUL });
    expect(pipe.transform({ q: 'normal' }, { type: 'body' })).toEqual({ q: 'normal' });
  });
});

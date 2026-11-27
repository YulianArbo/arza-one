import { describe, expect, it } from 'vitest';

import { CHUNK_SIZE, MAX_CHUNKS, chunksOf } from './chunking.js';

describe('fragmentos para la búsqueda del asistente (B47)', () => {
  it('junta los párrafos cortos en un fragmento', () => {
    expect(chunksOf('Objetivo\n\nAlcance:   todos   los procesos.\n\n\n')).toEqual([
      'Objetivo\nAlcance: todos los procesos.',
    ]);
  });

  it('ningún fragmento pasa del tamaño máximo', () => {
    const paragraph = 'palabra '.repeat(500).trim();
    const chunks = chunksOf(`${paragraph}\n\n${paragraph}`);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= CHUNK_SIZE && chunk.length > 0)).toBe(true);
  });

  it('una palabra más larga que un fragmento se corta', () => {
    const chunks = chunksOf('x'.repeat(CHUNK_SIZE * 2));
    expect(chunks.every((chunk) => chunk.length <= CHUNK_SIZE)).toBe(true);
  });

  it('un texto vacío no tiene fragmentos y uno enorme se limita', () => {
    expect(chunksOf('  \n\n ')).toEqual([]);
    const huge = Array.from({ length: MAX_CHUNKS + 50 }, () => 'p'.repeat(CHUNK_SIZE)).join('\n\n');
    expect(chunksOf(huge)).toHaveLength(MAX_CHUNKS);
  });
});

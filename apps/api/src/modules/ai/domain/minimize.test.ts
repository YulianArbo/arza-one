import { describe, expect, it } from 'vitest';

import { inputClassOf, minimized, sourceViews, type PreparedSource } from './minimize.js';

function source(id: string, body: string, classification: PreparedSource['classification']) {
  return { kind: 'document', id, code: `PR-${id}`, title: 'Título', classification, body } as const;
}

describe('minimización de cada petición (B47)', () => {
  it('borra datos personales, numera las fuentes y cuenta lo borrado', () => {
    const result = minimized(
      {
        useCase: 'doc_search',
        target: null,
        question: '¿Qué hago si me escribe ana@cliente.co?',
        sources: [source('1', 'Llame al 300 123 4567.', 'internal')],
        alwaysCited: false,
      },
      1000,
    );
    expect(result.question).toBe('¿Qué hago si me escribe [correo]?');
    expect(result.sources).toEqual([
      { ...source('1', 'Llame al [número].', 'internal'), ref: 'F1' },
    ]);
    expect(result).toMatchObject({ redactions: 2, truncated: false });
  });

  it('recorta al tamaño máximo y lo avisa', () => {
    const result = minimized(
      {
        useCase: 'doc_summary',
        target: null,
        question: null,
        sources: [source('1', 'a'.repeat(80), 'internal'), source('2', 'b'.repeat(80), 'internal')],
        alwaysCited: true,
      },
      100,
    );
    expect(result.sources.map((item) => item.body.length)).toEqual([80, 20]);
    expect(result).toMatchObject({ truncated: true, chars: 100 });
  });
});

describe('clase y fuentes de cada petición (B47)', () => {
  it('dice la clase más alta de lo enviado y nombra cada registro una vez', () => {
    expect(inputClassOf([])).toBe('none');
    expect(inputClassOf([source('1', 'x', 'public')])).toBe('internal');
    const both = [source('1', 'x', 'internal'), source('1', 'y', 'confidential')];
    expect(inputClassOf(both)).toBe('confidential');
    expect(sourceViews(both)).toEqual([
      { kind: 'document', id: '1', code: 'PR-1', title: 'Título' },
    ]);
  });
});

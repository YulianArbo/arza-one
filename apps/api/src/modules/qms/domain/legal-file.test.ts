import { LEGAL_IMPORT_COLUMNS } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { MAX_IMPORT_ROWS, readLegalFile, requirementKey } from './legal-file.js';

// Lectura del archivo del normograma (B46, decisión 6).

const HEADER = [...LEGAL_IMPORT_COLUMNS];
const ROW = [
  'Ley',
  'Ley 1581 de 2012',
  'Congreso de la República',
  'Art. 9',
  'Autorización previa del titular.',
  'Casilla no premarcada.',
  'DG',
  'Sí',
];

describe('lectura del normograma', () => {
  it('lee una fila válida con el código del proceso aparte', () => {
    const reading = readLegalFile([HEADER, ROW]);
    expect(reading.ok).toBe(true);
    if (!reading.ok) return;
    expect(reading.rows[0]).toMatchObject({
      line: 2,
      norm: 'Ley 1581 de 2012',
      article: 'Art. 9',
      processCode: 'DG',
      errors: [],
      input: { norm_type: 'law', applies: true, compliance_means: 'Casilla no premarcada.' },
    });
  });

  it('acepta «No» en Aplica y celdas opcionales vacías', () => {
    const reading = readLegalFile([
      HEADER,
      ['decreto', 'Decreto 1074', 'MinCIT', '', 'Registro de bases.', '', '', 'no'],
    ]);
    expect(reading.ok && reading.rows[0]?.input).toMatchObject({
      norm_type: 'decree',
      article: null,
      compliance_means: null,
      applies: false,
    });
    expect(reading.ok && reading.rows[0]?.processCode).toBeNull();
  });
});

describe('errores de una fila del normograma', () => {
  it('explica cada error de una fila', () => {
    const reading = readLegalFile([HEADER, ['Tratado', 'L', 'X', '', 'abc', '', '', 'Tal vez']]);
    expect(reading.ok).toBe(true);
    if (!reading.ok) return;
    const row = reading.rows[0];
    expect(row?.input).toBeNull();
    expect(row?.errors).toEqual(
      expect.arrayContaining([
        'El tipo de norma «Tratado» no existe.',
        'En «Aplica» escriba «Sí» o «No».',
        expect.stringContaining('Norma'),
        expect.stringContaining('Requisito'),
      ]),
    );
  });
});

describe('archivo del normograma completo', () => {
  it('marca la norma y los artículos repetidos en el mismo archivo', () => {
    const reading = readLegalFile([
      HEADER,
      ROW,
      [...ROW.slice(0, 1), ' ley 1581 de 2012 ', ...ROW.slice(2)],
    ]);
    expect(reading.ok && reading.rows[1]?.errors).toEqual(['La norma y los artículos se repiten.']);
  });

  it('rechaza un archivo sin filas, con otro encabezado o demasiado largo', () => {
    expect(readLegalFile([])).toEqual({ ok: false, error: 'El archivo no tiene requisitos.' });
    expect(readLegalFile([HEADER])).toMatchObject({ ok: false });
    const wrongHeader = readLegalFile([['Norma'], ROW]);
    expect(!wrongHeader.ok && wrongHeader.error).toContain('Tipo de norma');
    const many = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => ROW);
    expect(readLegalFile([HEADER, ...many])).toMatchObject({ ok: false });
  });

  it('la clave no distingue mayúsculas ni espacios', () => {
    expect(requirementKey(' Ley 1581 ', 'ART. 9')).toBe(requirementKey('ley 1581', 'art. 9'));
    expect(requirementKey('Ley 1581', null)).toBe('ley 1581|');
  });
});

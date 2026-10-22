import { describe, expect, it } from 'vitest';

import { readRetentionTable } from './retention-table.js';

const HEADER = 'Código;Serie;Tipo;Proceso;Años gestión;Años central;Disposición;Fundamento';

describe('lectura del RE-SGC-005', () => {
  it('lee cada serie con sus años, su disposición y a qué se aplica', () => {
    const table = readRetentionTable(
      [
        HEADER,
        'con-01;Contratos con clientes;CT;;2;8;Eliminar;Ley 962 de 2005, art. 28',
        'HL;Historias laborales;;gth;20;60;Conservación total;Decreto 1072 de 2015',
      ].join('\n'),
    );
    expect(table.problems).toEqual([]);
    expect(table.rows).toEqual([
      {
        row: 2,
        processCode: null,
        rule: {
          code: 'CON-01',
          name: 'Contratos con clientes',
          doc_type: 'CT',
          active_years: 2,
          archive_years: 8,
          disposition: 'destroy',
          legal_basis: 'Ley 962 de 2005, art. 28',
        },
      },
      expect.objectContaining({ row: 3, processCode: 'GTH' }),
    ]);
    expect(table.rows[1]?.rule).toMatchObject({ doc_type: null, disposition: 'keep' });
  });
});

describe('lectura del RE-SGC-005: problemas', () => {
  it('explica cada fila con problemas y no la toma', () => {
    const table = readRetentionTable(
      [
        HEADER,
        'A1;Serie sin destino;;;1;1;Eliminar;Norma',
        'A2;Serie;PR;;uno;1;Eliminar;Norma',
        'A3;Serie;PR;;1;1;Quemar;Norma',
        'A4;Serie;PR;;1;1;Eliminar;Norma',
        'a4;Repetida;PR;;1;1;Eliminar;Norma',
      ].join('\n'),
    );
    expect(table.rows.map((row) => row.rule.code)).toEqual(['A4']);
    expect(table.problems.map((p) => [p.row, p.code])).toEqual([
      [2, 'A1'],
      [3, 'A2'],
      [4, 'A3'],
      [6, 'A4'],
    ]);
    expect(table.problems[2]?.problem).toContain('Conservación total');
    expect(table.problems[3]?.problem).toBe('el código está repetido');
  });

  it('sin las columnas obligatorias no lee nada', () => {
    const table = readRetentionTable('Código;Serie\nA1;Serie');
    expect(table.rows).toEqual([]);
    expect(table.problems[0]?.problem).toContain('anos gestion');
  });
});

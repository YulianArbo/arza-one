import { describe, expect, it } from 'vitest';

import { parseCsv, toCsv } from './csv.js';

describe('CSV del Listado Maestro', () => {
  it('escribe con BOM, punto y coma y comillas cuando hace falta', () => {
    const csv = toCsv(['Código', 'Nombre'], [['PR-SGC-001', 'Control; de documentos']]);
    expect(csv).toBe('﻿Código;Nombre\r\nPR-SGC-001;"Control; de documentos"\r\n');
  });

  it('neutraliza las fórmulas y deja vacías las celdas sin valor', () => {
    expect(toCsv(['a', 'b'], [['=1+1', null]])).toBe("﻿a;b\r\n'=1+1;\r\n");
  });

  it('lee lo que escribe', () => {
    const rows = [['PR-SGC-001', 'Comillas "dobles"; y separador', 'Línea\nnueva']];
    expect(parseCsv(toCsv(['a', 'b', 'c'], rows))).toEqual([['a', 'b', 'c'], ...rows]);
  });

  it('lee un archivo separado por comas y omite las líneas vacías', () => {
    expect(parseCsv('codigo,nombre\r\n\r\nPR-SGC-001,"Uno, dos"\r\n')).toEqual([
      ['codigo', 'nombre'],
      ['PR-SGC-001', 'Uno, dos'],
    ]);
  });
});

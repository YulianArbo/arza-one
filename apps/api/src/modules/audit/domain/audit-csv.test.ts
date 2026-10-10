import { describe, expect, it } from 'vitest';

import { toCsv } from './audit-csv.js';

describe('exportación CSV de la auditoría', () => {
  it('escribe el encabezado, las filas y celdas vacías para lo que no hay', () => {
    expect(toCsv(['a', 'b'], [[1, null]])).toBe('﻿a,b\r\n1,\r\n');
  });

  it('pone entre comillas lo que lleva comas, comillas o saltos de línea', () => {
    expect(toCsv(['x'], [['uno, "dos"\ntres']])).toBe('﻿x\r\n"uno, ""dos""\ntres"\r\n');
  });

  it('desactiva las fórmulas que una celda podría ejecutar en la hoja de cálculo', () => {
    const csv = toCsv(['x'], [['=HYPERLINK("http://malo")'], ['+1'], ['-2'], ['@SUM(A1)']]);
    expect(csv.split('\r\n').slice(1, 5)).toEqual([
      `"'=HYPERLINK(""http://malo"")"`,
      "'+1",
      "'-2",
      "'@SUM(A1)",
    ]);
  });
});

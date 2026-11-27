import { describe, expect, it } from 'vitest';

import { csvCell, csvHeader, csvLine } from './export-csv.js';

describe('CSV de la exportación (B48)', () => {
  it('deja los números, incluso negativos, tal cual', () => {
    expect(csvCell(-1250.5)).toBe('-1250.5');
    expect(csvCell('-1250.50')).toBe('-1250.50');
    expect(csvCell(true)).toBe('true');
  });

  it('neutraliza lo que Excel tomaría por fórmula', () => {
    expect(csvCell('=SUMA(A1)')).toBe("'=SUMA(A1)");
    expect(csvCell('@usuario')).toBe("'@usuario");
    expect(csvCell('-texto')).toBe("'-texto");
  });

  it('entrecomilla el separador, las comillas y los saltos de línea', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('dijo "hola"\nadiós')).toBe('"dijo ""hola""\nadiós"');
  });

  it('escribe los objetos como JSON y null como vacío', () => {
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
    expect(csvCell(null)).toBe('');
  });

  it('arma encabezado con BOM y filas en el orden de las columnas', () => {
    expect(csvHeader(['id', 'name'])).toBe('﻿id;name\r\n');
    expect(csvLine(['id', 'name'], { name: 'Sede', id: 7 })).toBe('7;Sede\r\n');
  });
});

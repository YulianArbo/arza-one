import { describe, expect, it } from 'vitest';

import type { LoadReport } from '../../application/initial-load.js';
import { detailLines, reportCsv, summaryLines } from './load-report.js';

// Informe de la carga inicial (B45): lo que ve la persona en la consola y el CSV de evidencia.

const SHEETS: LoadReport['sheets'] = [
  { sheet: 'estructura', planned: 2, created: 0, existing: 1, problems: [] },
  {
    sheet: 'usuarios',
    planned: 1,
    created: 0,
    existing: 0,
    problems: [{ row: 3, key: 'ana@empresa.example', problem: 'el correo no es válido' }],
  },
  { sheet: 'terceros', planned: 0, created: 0, existing: 2, problems: [] },
];

describe('informe de la carga inicial', () => {
  it('sin aplicar dice qué se crearía y por qué no se cargó nada', () => {
    const report: LoadReport = { applied: false, missingPermissions: [], sheets: SHEETS };
    expect(summaryLines(report)).toEqual([
      'areas.csv y cargos.csv: 2 por crear, 1 ya existían, 0 con problemas',
      'usuarios.csv: 1 por crear, 0 ya existían, 1 con problemas',
      'terceros.csv: 0 por crear, 2 ya existían, 0 con problemas',
      'No se cargó nada: corrija los problemas y vuelva a revisar.',
    ]);
    expect(detailLines(report)).toEqual([
      '  usuarios.csv, fila 3 ana@empresa.example: el correo no es válido',
    ]);
  });

  it('sin problemas invita a aplicar y, aplicada, cuenta lo creado', () => {
    const clean = SHEETS.map((sheet) => ({ ...sheet, problems: [] }));
    expect(summaryLines({ applied: false, missingPermissions: [], sheets: clean }).at(-1)).toBe(
      'Revisión sin problemas: vuelva a correr el comando con --aplicar para cargar.',
    );
    const applied = clean.map((sheet) => ({ ...sheet, created: sheet.planned }));
    expect(summaryLines({ applied: true, missingPermissions: [], sheets: applied })).toEqual([
      'areas.csv y cargos.csv: 2 creados de 2, 1 ya existían, 0 con problemas',
      'usuarios.csv: 1 creados de 1, 0 ya existían, 0 con problemas',
      'terceros.csv: 0 creados de 0, 2 ya existían, 0 con problemas',
      'Carga aplicada.',
    ]);
  });
});

describe('informe de la carga inicial sin permisos', () => {
  it('lo dice y no muestra plantillas', () => {
    const report: LoadReport = {
      applied: false,
      missingPermissions: ['party.create'],
      sheets: [],
    };
    expect(summaryLines(report)).toEqual([
      'No se revisó nada: a la persona le faltan los permisos party.create.',
    ]);
  });
});

describe('informe de la carga inicial en CSV', () => {
  it('trae una fila por problema y el resumen', () => {
    const csv = reportCsv({ applied: false, missingPermissions: [], sheets: SHEETS });
    expect(csv).toContain('Plantilla;Fila;Clave;Detalle');
    expect(csv).toContain('usuarios.csv;3;ana@empresa.example;el correo no es válido');
    expect(csv).toContain('Resumen;;;No se cargó nada');
  });
});

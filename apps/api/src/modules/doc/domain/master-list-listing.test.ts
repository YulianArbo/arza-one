import { describe, expect, it } from 'vitest';

import { readListing } from './master-list-listing.js';
import { differences } from './master-list-reconcile.js';

const HEADER = [
  'Código',
  'Nombre',
  'Tipo',
  'Proceso',
  'Versión',
  'Fecha',
  'Estado',
  'Responsable',
  'Destinatarios',
  'Clasificación',
  'Archivo',
];

function row(overrides: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    Código: 'PR-SGC-001',
    Nombre: 'Control de la información documentada',
    Tipo: 'PR',
    Proceso: 'SGC',
    Versión: '03',
    Fecha: '15/03/2025',
    Estado: 'Vigente',
    Responsable: 'Coordinador de Calidad',
    Destinatarios: 'Coordinador de Calidad | Director General',
    Clasificación: 'Interno',
    Archivo: '',
    ...overrides,
  };
  return HEADER.map((title) => base[title] ?? '');
}

describe('lectura del Listado Maestro RE-SGC-001', () => {
  it('lee una fila vigente con su versión, fecha, cargos y clasificación', () => {
    const { entries, problems } = readListing([HEADER, row()]);
    expect(problems).toEqual([]);
    expect(entries).toEqual([
      {
        row: 2,
        code: 'PR-SGC-001',
        title: 'Control de la información documentada',
        docType: 'PR',
        processCode: 'SGC',
        number: 3,
        effectiveDate: '2025-03-15',
        owner: 'Coordinador de Calidad',
        targets: ['Coordinador de Calidad', 'Director General'],
        classification: 'internal',
        fileName: null,
      },
    ]);
  });

  it('acepta encabezados sin tildes ni mayúsculas, y el RIT sin proceso', () => {
    const header = ['codigo', 'NOMBRE', 'version', 'fecha'];
    const listing = readListing([
      header,
      ['RIT-001', 'Reglamento Interno de Trabajo', '0', '1/2/2024'],
    ]);
    expect(listing.entries[0]).toMatchObject({ docType: 'RIT', processCode: null, number: 0 });
  });

  it('las filas no vigentes se omiten y se informan', () => {
    const listing = readListing([HEADER, row({ Estado: 'Obsoleto' })]);
    expect(listing.entries).toEqual([]);
    expect(listing.skipped).toEqual([
      { row: 2, code: 'PR-SGC-001', problem: 'estado «Obsoleto»: no se carga' },
    ]);
  });
});

describe('filas con problemas', () => {
  it('explica cada fila con problemas y no la carga', () => {
    const rows = [
      HEADER,
      row({ Código: 'PR-001' }),
      row({ Código: 'PR-SGC-002', Tipo: 'PL' }),
      row({ Código: 'PR-SGC-003', Versión: 'v3' }),
      row({ Código: 'PR-SGC-004', Fecha: '31/02/2025' }),
      row({ Código: 'PR-SGC-005', Clasificación: 'Secreto' }),
      row({ Código: 'PR-SGC-006', Proceso: 'COM' }),
      row({ Código: 'RIT-SGC-001' }),
      row({ Código: 'PR-SGC-007' }),
      row({ Código: 'PR-SGC-007' }),
    ];
    const { entries, problems } = readListing(rows);
    expect(entries.map((entry) => entry.code)).toEqual(['PR-SGC-007']);
    expect(problems.map((problem) => [problem.row, problem.problem])).toEqual([
      [2, 'falta el proceso en el código'],
      [3, 'el tipo no coincide con el código'],
      [4, 'la versión debe ser un número de 0 a 99'],
      [5, 'la fecha debe ser dd/mm/aaaa'],
      [6, 'la clasificación no es pública, interna, confidencial ni restringida'],
      [7, 'el proceso no coincide con el código'],
      [8, 'este tipo no lleva proceso'],
      [10, 'el código está repetido'],
    ]);
  });

  it('sin las columnas obligatorias no lee nada', () => {
    const listing = readListing([
      ['Código', 'Nombre'],
      ['PR-SGC-001', 'Algo'],
    ]);
    expect(listing.problems).toEqual([
      { row: 1, code: null, problem: 'faltan las columnas: version, fecha' },
    ]);
  });
});

describe('conciliación con la plataforma', () => {
  const [entry] = readListing([HEADER, row()]).entries;
  const listing = entry === undefined ? [] : [entry];
  const same = {
    code: 'PR-SGC-001',
    title: 'Control de la información documentada',
    versionLabel: '03',
    effectiveDate: '2025-03-15',
    status: 'current',
  };

  it('sin diferencias cuando coinciden documento por documento', () => {
    expect(differences(listing, [same])).toEqual([]);
  });

  it('informa lo que falta, lo que sobra y lo que no coincide', () => {
    expect(differences(listing, [])).toEqual([
      { code: 'PR-SGC-001', problem: 'no está en la plataforma' },
    ]);
    const changed = { ...same, title: 'Otro', versionLabel: '02', effectiveDate: '2025-01-01' };
    expect(differences(listing, [changed]).map((d) => d.problem)).toEqual([
      'el nombre es distinto',
      'la versión en la plataforma es 02',
      'la fecha es distinta',
    ]);
    expect(differences(listing, [{ ...same, status: 'draft' }])[0]?.problem).toBe(
      'en la plataforma no está vigente',
    );
    const extra = { ...same, code: 'PL-SGC-001' };
    expect(differences(listing, [same, extra])).toEqual([
      { code: 'PL-SGC-001', problem: 'está vigente en la plataforma y no en el listado' },
    ]);
  });
});

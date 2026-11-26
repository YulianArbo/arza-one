import { nitCheckDigit } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { KnownStructure } from './known.js';
import { planCompanies, planUsers, type UserContext } from './people-plan.js';
import { normalizedHeader, readSheet } from './sheet.js';
import { AREA_COLUMNS, planStructure } from './structure-plan.js';

// Reglas de las plantillas de la carga inicial (B45). Ningún dato es real: correos de dominios
// reservados y NIT inventados con su dígito de verificación calculado.

const KNOWN: KnownStructure = {
  units: new Map([
    ['DG', { id: 'u-dg', isActive: true }],
    ['VIEJO', null],
  ]),
  positions: [
    { id: 'p-dir', name: 'Director General', isActive: true },
    { id: 'p-old', name: 'Cargo Retirado', isActive: false },
  ],
};

function problemsOf(list: readonly { readonly problem: string }[]): string[] {
  return list.map((item) => item.problem);
}

describe('lectura de las plantillas', () => {
  it('reconoce los encabezados sin tildes, mayúsculas ni signos', () => {
    expect(normalizedHeader('Proceso o Área')).toBe('procesoarea');
    expect(normalizedHeader('Depende de')).toBe('depende');
    const sheet = readSheet(
      [
        ['CÓDIGO', 'Nombre', 'tipo'],
        ['COM', 'Comercial', 'Proceso'],
      ],
      AREA_COLUMNS,
    );
    expect(sheet.rows).toEqual([
      { row: 2, cells: { code: 'COM', name: 'Comercial', kind: 'Proceso' } },
    ]);
  });

  it('informa las columnas obligatorias que faltan', () => {
    const sheet = readSheet([['Código', 'Nombre']], AREA_COLUMNS);
    expect(problemsOf(sheet.problems)).toEqual(['faltan las columnas Tipo']);
  });
});

const STRUCTURE_HEADER = {
  areas: ['Código', 'Nombre', 'Tipo', 'Depende de', 'Cargo líder'],
  positions: ['Cargo', 'Proceso o área', 'Reporta a'],
};

describe('áreas y cargos nuevos', () => {
  it('agrega solo lo nuevo, cada uno después de lo que necesita', () => {
    const plan = planStructure(
      {
        areas: [
          STRUCTURE_HEADER.areas,
          ['MER-DIG', 'Mercadeo digital', 'Área', 'MER', 'Analista de Mercadeo'],
          ['MER', 'Mercadeo', 'Proceso', 'DG', 'Jefe de Mercadeo'],
          ['DG', 'Dirección', 'Proceso', '', ''],
        ],
        positions: [
          STRUCTURE_HEADER.positions,
          ['Analista de Mercadeo', 'MER-DIG', 'Jefe de Mercadeo'],
          ['Jefe de Mercadeo', 'MER', 'director general'],
          ['Director General', 'DG', ''],
        ],
      },
      KNOWN,
    );
    expect(plan.problems).toEqual([]);
    expect(plan.units.map((unit) => unit.code)).toEqual(['MER', 'MER-DIG']);
    expect(plan.positions.map((position) => position.name)).toEqual([
      'Jefe de Mercadeo',
      'Analista de Mercadeo',
    ]);
    expect(plan.positions[0]?.boss).toEqual({ kind: 'existing', id: 'p-dir' });
    expect(plan.units[1]?.owner).toEqual({ kind: 'new', key: 'analista de mercadeo' });
    expect([plan.existingUnits, plan.existingPositions]).toEqual([1, 1]);
  });
});

describe('áreas y cargos con problemas', () => {
  it('rechaza referencias que no existen, códigos eliminados, repetidos y círculos', () => {
    const plan = planStructure(
      {
        areas: [
          STRUCTURE_HEADER.areas,
          ['VIEJO', 'Antiguo', 'Área', '', ''],
          ['A1', 'Uno', 'Área', 'A2', ''],
          ['A2', 'Dos', 'Área', 'A1', ''],
          ['A3', 'Tres', 'Otra cosa', 'NADA', ''],
          ['A3', 'Tres otra vez', 'Área', '', ''],
          ['minúscula!', 'Mal', 'Área', '', ''],
        ],
        positions: [STRUCTURE_HEADER.positions, ['Sin proceso', 'NADA', 'Nadie']],
      },
      KNOWN,
    );
    expect(problemsOf(plan.problems)).toEqual(
      expect.arrayContaining([
        'el código debe tener mayúsculas, números y guiones (máximo 20)',
        'el código está repetido en el archivo',
        'el tipo debe ser «Proceso» o «Área»',
        'el proceso o área NADA no existe ni está en areas.csv',
        'el cargo «Nadie» no existe ni está en cargos.csv',
        'las dependencias forman un círculo',
      ]),
    );
    expect(plan.units).toEqual([]);
  });

  it('un código eliminado no se reutiliza', () => {
    const plan = planStructure(
      { areas: [STRUCTURE_HEADER.areas, ['NUEVO', 'Nuevo', 'Área', 'VIEJO', '']], positions: [] },
      KNOWN,
    );
    expect(problemsOf(plan.problems)).toEqual(['el proceso o área VIEJO se eliminó']);
  });
});

const USER_CONTEXT: UserContext = {
  known: KNOWN,
  newPositions: new Set(['jefe de mercadeo']),
  roles: new Set(['COMERCIAL', 'CALIDAD']),
  accounts: new Set(['ya@empresa.example']),
};
const USER_HEADER = ['Correo', 'Nombre', 'Cargo', 'Roles'];

describe('usuarios nuevos', () => {
  it('prepara la invitación con su cargo y sus roles; los que tienen cuenta no se repiten', () => {
    const plan = planUsers(
      [
        USER_HEADER,
        ['Ana@Empresa.example', 'Ana Prueba', 'Jefe de Mercadeo', 'comercial | CALIDAD'],
        ['ya@empresa.example', 'Ya Existe', '', ''],
        ['luis@empresa.example', 'Luis Prueba', 'Director General', ''],
      ],
      USER_CONTEXT,
    );
    expect(plan.problems).toEqual([]);
    expect(plan.existing).toBe(1);
    expect(plan.items).toEqual([
      {
        row: 2,
        email: 'ana@empresa.example',
        displayName: 'Ana Prueba',
        position: { kind: 'new', key: 'jefe de mercadeo' },
        roleCodes: ['COMERCIAL', 'CALIDAD'],
      },
      {
        row: 4,
        email: 'luis@empresa.example',
        displayName: 'Luis Prueba',
        position: { kind: 'existing', id: 'p-dir' },
        roleCodes: [],
      },
    ]);
  });
});

describe('usuarios con problemas', () => {
  it('no asigna por carga los roles de administrador ni usa cargos inactivos', () => {
    const plan = planUsers(
      [
        USER_HEADER,
        ['admin@empresa.example', 'Admin Prueba', '', 'ADMIN_PLATAFORMA'],
        ['viejo@empresa.example', 'Viejo Prueba', 'Cargo Retirado', ''],
        ['no-es-correo', 'X', '', ''],
        ['ana@empresa.example', 'Ana Uno', '', ''],
        ['ANA@empresa.example', 'Ana Dos', '', ''],
      ],
      USER_CONTEXT,
    );
    expect(problemsOf(plan.problems)).toEqual([
      'estos roles no se asignan por carga: ADMIN_PLATAFORMA (asígnelos en Administración)',
      'el cargo «Cargo Retirado» está inactivo',
      'el correo no es válido',
      'el nombre debe tener entre 2 y 120 letras',
      'el correo está repetido en el archivo',
    ]);
    expect(plan.items.map((item) => item.email)).toEqual(['ana@empresa.example']);
  });
});

const nit = '900123456';
const digit = String(nitCheckDigit(nit));
const COMPANY_HEADER = [
  'NIT',
  'DV',
  'Razón social',
  'Nombre comercial',
  'Papel',
  'Correo',
  'Ciudad',
];

describe('terceros empresa nuevos', () => {
  it('registra la organización con NIT, sus papeles y sin autorización de datos', () => {
    const plan = planCompanies(
      [
        COMPANY_HEADER,
        [
          nit,
          digit,
          'Cliente Ficticio S.A.S.',
          'Ficticio',
          'Cliente, Proveedor',
          'Pagos@Ficticio.example',
          'Bogotá',
        ],
      ],
      new Set(),
    );
    expect(plan.problems).toEqual([]);
    expect(plan.items[0]?.input).toMatchObject({
      kind: 'organization',
      id_type: 'NIT',
      id_number: nit,
      check_digit: Number(digit),
      legal_name: 'Cliente Ficticio S.A.S.',
      email: 'pagos@ficticio.example',
      roles: ['customer', 'supplier'],
      consent: null,
    });
  });
});

describe('terceros empresa con problemas', () => {
  it('rechaza el dígito de verificación equivocado, el papel desconocido y el NIT repetido', () => {
    const wrong = String((Number(digit) + 1) % 10);
    const plan = planCompanies(
      [
        COMPANY_HEADER,
        [nit, wrong, 'Uno S.A.S.', '', 'Cliente'],
        ['900.123', digit, 'Dos S.A.S.', '', 'Cliente'],
        [nit, digit, 'Tres S.A.S.', '', 'Socio'],
        [nit, digit, 'Cuatro S.A.S.', '', 'Proveedor'],
      ],
      new Set(),
    );
    expect(problemsOf(plan.problems)).toEqual([
      'el dígito de verificación no corresponde al NIT',
      'el NIT lleva solo números, sin puntos ni dígito de verificación',
      'el NIT está repetido en el archivo',
      'el papel debe ser «Cliente», «Proveedor» o ambos',
      'el NIT está repetido en el archivo',
    ]);
  });

  it('un NIT ya registrado se cuenta como existente', () => {
    const plan = planCompanies(
      [COMPANY_HEADER, [nit, digit, 'Uno S.A.S.', '', 'Proveedor']],
      new Set([nit]),
    );
    expect([plan.items.length, plan.existing]).toEqual([0, 1]);
  });
});

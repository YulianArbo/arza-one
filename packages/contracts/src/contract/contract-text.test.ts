import { describe, expect, it } from 'vitest';

import { amountInWords } from './amount-in-words.js';
import {
  clauseOrdinal,
  CONTRACT_VARIABLES,
  fillClause,
  fitsModel,
  unknownVariables,
  variablesOf,
  type ContractValues,
} from './contract-text.js';
import { daysUntil, expiryAlertDue } from './expiry.js';

const VALUES: ContractValues = {
  codigo_contrato: 'CTR-2026-0001',
  empresa_razon_social: 'ARZA TECH S.A.S.',
  empresa_nit: '901.000.000-1',
  cliente_nombre: 'Cliente de prueba',
  cliente_documento: 'NIT 900.000.000-2',
  cliente_direccion: 'Calle 1 # 2-3',
  cliente_ciudad: 'Bogotá',
  cliente_correo: 'cliente@example.com',
  cliente_representante: 'Ana Prueba',
  cliente_representante_documento: 'CC 1.000.000',
  objeto: 'el objeto',
  valor: '$ 1.000,00',
  valor_letras: 'MIL PESOS M/CTE.',
  forma_pago: 'contado',
  fecha_inicio: '01/11/2026',
  fecha_fin: '31/10/2027',
  cotizacion: 'COT-2026-0001 versión 1',
};

it('el ejemplo cubre todas las variables', () => {
  expect(Object.keys(VALUES).sort()).toEqual(Object.keys(CONTRACT_VARIABLES).sort());
});

const MODEL =
  'EL CONTRATISTA se obliga con {{cliente_nombre}} a {{objeto}}. El valor es {{valor_letras}} ({{valor}}).';

describe('Un contrato generado es idéntico al modelo salvo las variables', () => {
  it('llena cada variable con su valor y no toca nada más', () => {
    const values = {
      ...VALUES,
      cliente_nombre: 'Comercializadora Andina S.A.S.',
      objeto: 'desarrollar el portal de clientes',
      valor_letras: 'DIEZ MILLONES DE PESOS M/CTE.',
      valor: '$ 10.000.000,00',
    };
    const text = fillClause(MODEL, values);
    expect(text).toBe(
      'EL CONTRATISTA se obliga con Comercializadora Andina S.A.S. a desarrollar el portal de clientes. El valor es DIEZ MILLONES DE PESOS M/CTE. ($ 10.000.000,00).',
    );
    expect(fitsModel(MODEL, text)).toBe(true);
  });

  it('detecta un solo carácter cambiado fuera de las variables', () => {
    const text = fillClause(MODEL, VALUES);
    expect(fitsModel(MODEL, text.replace('se obliga', 'se compromete'))).toBe(false);
    expect(fitsModel(MODEL, `${text} `)).toBe(false);
    expect(fitsModel(MODEL, text.replace('EL ', 'El '))).toBe(false);
  });

  it('acepta variables repetidas y respeta los signos especiales del texto', () => {
    const model = '¿{{cliente_nombre}}? (sí) $ [{{cliente_nombre}}] *.+';
    expect(fitsModel(model, fillClause(model, VALUES))).toBe(true);
  });

  it('lista las variables y señala las que no existen', () => {
    expect(variablesOf(MODEL)).toEqual(['cliente_nombre', 'objeto', 'valor_letras', 'valor']);
    expect(unknownVariables('Hola {{cliente_nombre}} y {{precio}} {{ objeto }}')).toEqual([
      'precio',
    ]);
    expect(fillClause('{{precio}}', VALUES)).toBe('{{precio}}');
  });
});

describe('Número de la cláusula', () => {
  it('escribe los ordinales como en un contrato', () => {
    expect(clauseOrdinal(1)).toBe('PRIMERA');
    expect(clauseOrdinal(7)).toBe('SÉPTIMA');
    expect(clauseOrdinal(10)).toBe('DÉCIMA');
    expect(clauseOrdinal(12)).toBe('DÉCIMA SEGUNDA');
    expect(clauseOrdinal(20)).toBe('VIGÉSIMA');
    expect(clauseOrdinal(29)).toBe('VIGÉSIMA NOVENA');
    expect(() => clauseOrdinal(0)).toThrow(RangeError);
    expect(() => clauseOrdinal(30)).toThrow(RangeError);
  });
});

describe('Valor en letras', () => {
  it.each([
    ['0', 'CERO PESOS M/CTE.'],
    ['1', 'UN PESO M/CTE.'],
    ['21', 'VEINTIÚN PESOS M/CTE.'],
    ['100', 'CIEN PESOS M/CTE.'],
    ['101', 'CIENTO UN PESOS M/CTE.'],
    ['1000', 'MIL PESOS M/CTE.'],
    ['31500', 'TREINTA Y UN MIL QUINIENTOS PESOS M/CTE.'],
    ['100000', 'CIEN MIL PESOS M/CTE.'],
    ['1000000', 'UN MILLÓN DE PESOS M/CTE.'],
    ['10000000', 'DIEZ MILLONES DE PESOS M/CTE.'],
    ['1200000', 'UN MILLÓN DOSCIENTOS MIL PESOS M/CTE.'],
    ['19065000.00', 'DIECINUEVE MILLONES SESENTA Y CINCO MIL PESOS M/CTE.'],
    ['2000000000000', 'DOS BILLONES DE PESOS M/CTE.'],
    ['1001001.5', 'UN MILLÓN MIL UN PESOS CON 50/100 M/CTE.'],
    [
      '999999999.99',
      'NOVECIENTOS NOVENTA Y NUEVE MILLONES NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE PESOS CON 99/100 M/CTE.',
    ],
  ])('%s → %s', (amount, words) => {
    expect(amountInWords(amount)).toBe(words);
  });
});

describe('Alertas de vencimiento a 90, 60 y 30 días', () => {
  it('cuenta los días hasta la fecha', () => {
    expect(daysUntil('2026-10-29', '2026-10-29')).toBe(0);
    expect(daysUntil('2026-10-29', '2027-01-27')).toBe(90);
    expect(daysUntil('2026-10-29', '2026-10-28')).toBe(-1);
  });

  it('avisa una vez por umbral, sin repetir', () => {
    expect(expiryAlertDue(120, null)).toBeNull();
    expect(expiryAlertDue(90, null)).toBe(90);
    expect(expiryAlertDue(89, 90)).toBeNull();
    expect(expiryAlertDue(60, 90)).toBe(60);
    expect(expiryAlertDue(30, 60)).toBe(30);
    expect(expiryAlertDue(5, 30)).toBeNull();
    expect(expiryAlertDue(-1, 30)).toBeNull();
  });

  it('si se firmó tarde, avisa con el umbral más cercano', () => {
    expect(expiryAlertDue(45, null)).toBe(60);
    expect(expiryAlertDue(10, null)).toBe(30);
    expect(expiryAlertDue(10, 90)).toBe(30);
  });
});

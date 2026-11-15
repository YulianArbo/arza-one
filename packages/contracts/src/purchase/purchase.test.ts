import { describe, expect, it } from 'vitest';

import { addPurchaseQuoteSchema, registerReceiptSchema } from './requests.js';
import { createSupplierEvaluationSchema, supplierScore } from './suppliers.js';
import {
  isHigherTier,
  minQuotesOf,
  purchaseTierOf,
  purchaseTiersSchema,
  type PurchaseTiers,
} from './tiers.js';
import { saveTravelRequestSchema, travelBalance } from './travel.js';

const ID = '0195f3a2-7c41-7b9e-9d2a-3f4e5a6b7c8d';

const TIERS: PurchaseTiers = {
  low_limit: '1000000.00',
  mid_limit: '10000000.00',
  quotes_low: 1,
  quotes_mid: 2,
  quotes_high: 3,
};

describe('topes de aprobación de compras B33', () => {
  it('ubica el valor en su tramo, con el tope incluido en el tramo de abajo', () => {
    expect(purchaseTierOf('999999.99', TIERS)).toBe('low');
    expect(purchaseTierOf('1000000', TIERS)).toBe('low');
    expect(purchaseTierOf('1000000.01', TIERS)).toBe('mid');
    expect(purchaseTierOf('10000000.00', TIERS)).toBe('mid');
    expect(purchaseTierOf('10000000.01', TIERS)).toBe('high');
  });

  it('exige más cotizaciones a medida que sube el tramo', () => {
    expect(minQuotesOf('low', TIERS)).toBe(1);
    expect(minQuotesOf('mid', TIERS)).toBe(2);
    expect(minQuotesOf('high', TIERS)).toBe(3);
    expect(isHigherTier('high', 'mid')).toBe(true);
    expect(isHigherTier('mid', 'mid')).toBe(false);
    expect(isHigherTier('low', 'high')).toBe(false);
  });

  it('rechaza topes desordenados o que exigen menos cotizaciones arriba', () => {
    expect(purchaseTiersSchema.safeParse(TIERS).success).toBe(true);
    expect(purchaseTiersSchema.safeParse({ ...TIERS, mid_limit: '1000000.00' }).success).toBe(
      false,
    );
    expect(purchaseTiersSchema.safeParse({ ...TIERS, quotes_mid: 4 }).success).toBe(false);
    expect(purchaseTiersSchema.safeParse({ ...TIERS, quotes_low: 0 }).success).toBe(false);
  });
});

describe('contratos de compras B33', () => {
  it('la cotización lleva valor positivo, plazo válido y archivo', () => {
    const quote = { supplier_id: ID, amount: '250000.00', delivery_days: 5, file_id: ID };
    expect(addPurchaseQuoteSchema.safeParse(quote).success).toBe(true);
    expect(addPurchaseQuoteSchema.safeParse({ ...quote, amount: '0' }).success).toBe(false);
    expect(addPurchaseQuoteSchema.safeParse({ ...quote, delivery_days: -1 }).success).toBe(false);
    expect(addPurchaseQuoteSchema.safeParse({ ...quote, file_id: undefined }).success).toBe(false);
  });

  it('una recepción no conforme exige la explicación', () => {
    const receipt = { received_on: '2026-11-10', conforming: true, note: null };
    expect(registerReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(registerReceiptSchema.safeParse({ ...receipt, conforming: false }).success).toBe(false);
    expect(
      registerReceiptSchema.safeParse({ ...receipt, conforming: false, note: 'Llegó incompleto' })
        .success,
    ).toBe(true);
  });
});

describe('evaluación de proveedores B33', () => {
  it('promedia los cuatro criterios y da el resultado por cortes', () => {
    expect(supplierScore({ quality: 5, compliance: 4, price: 4, service: 4 })).toEqual({
      score: '4.25',
      result: 'approved',
    });
    expect(supplierScore({ quality: 4, compliance: 4, price: 4, service: 4 }).result).toBe(
      'approved',
    );
    expect(supplierScore({ quality: 4, compliance: 4, price: 4, service: 3 })).toEqual({
      score: '3.75',
      result: 'conditional',
    });
    expect(supplierScore({ quality: 3, compliance: 3, price: 3, service: 3 }).result).toBe(
      'conditional',
    );
    expect(supplierScore({ quality: 3, compliance: 3, price: 3, service: 2 })).toEqual({
      score: '2.75',
      result: 'rejected',
    });
  });
});

describe('contrato de la evaluación de proveedores B33', () => {
  it('califica de 1 a 5 y por año o semestre', () => {
    const evaluation = {
      supplier_id: ID,
      kind: 'reevaluation',
      period: '2026-2',
      criteria: { quality: 5, compliance: 5, price: 4, service: 4 },
      note: null,
    };
    expect(createSupplierEvaluationSchema.safeParse(evaluation).success).toBe(true);
    expect(
      createSupplierEvaluationSchema.safeParse({ ...evaluation, period: '2026-3' }).success,
    ).toBe(false);
    expect(
      createSupplierEvaluationSchema.safeParse({
        ...evaluation,
        criteria: { ...evaluation.criteria, quality: 6 },
      }).success,
    ).toBe(false);
  });
});

describe('viajes B33', () => {
  it('el regreso no puede ser anterior a la salida y el anticipo puede ser cero', () => {
    const travel = {
      destination: 'Medellín',
      purpose: 'Visita de seguimiento al cliente de prueba',
      starts_on: '2026-11-20',
      ends_on: '2026-11-22',
      advance_amount: '0',
    };
    expect(saveTravelRequestSchema.safeParse(travel).success).toBe(true);
    expect(saveTravelRequestSchema.safeParse({ ...travel, ends_on: '2026-11-19' }).success).toBe(
      false,
    );
  });

  it('el saldo es el anticipo menos los gastos, con signo', () => {
    expect(travelBalance('500000.00', ['120000.50', '79999.50'])).toBe('300000.00');
    expect(travelBalance('100000', ['150000.25'])).toBe('-50000.25');
    expect(travelBalance('0', [])).toBe('0.00');
  });
});

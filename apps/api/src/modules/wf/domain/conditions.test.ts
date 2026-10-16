import type { ConditionRule } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { compareDecimals, conditionHolds } from './conditions.js';

describe('comparación exacta de números', () => {
  it('compara dinero como texto sin perder centavos', () => {
    expect(compareDecimals('5000000.01', '5000000')).toBe(1);
    expect(compareDecimals('9999999999999999.99', '9999999999999999.98')).toBe(1);
    expect(compareDecimals('0005.50', 5.5)).toBe(0);
    expect(compareDecimals(-3, '2')).toBe(-1);
    expect(compareDecimals('-10', '-2')).toBe(-1);
    expect(compareDecimals('-0', 0)).toBe(0);
  });

  it('no compara lo que no es un número', () => {
    expect(compareDecimals('alto', 1)).toBeNull();
    expect(compareDecimals(true, 1)).toBeNull();
    expect(compareDecimals('1e5', 1)).toBeNull();
  });
});

describe('condiciones de las transiciones (ficha 17.5)', () => {
  const facts = { amount: '6000000.00', type: 'compra', urgent: true };

  it('sin condición siempre se cumple', () => {
    expect(conditionHolds(null, {})).toBe(true);
  });

  it('todas las reglas deben cumplirse', () => {
    const rules: ConditionRule[] = [
      { fact: 'amount', op: 'gt', value: 5_000_000 },
      { fact: 'type', op: 'in', value: ['compra', 'servicio'] },
    ];
    expect(conditionHolds(rules, facts)).toBe(true);
    expect(conditionHolds([...rules, { fact: 'urgent', op: 'eq', value: false }], facts)).toBe(
      false,
    );
  });

  it.each([
    ['gte', '6000000', true],
    ['lt', '6000000', false],
    ['lte', 6_000_000, true],
    ['eq', '6000000', true],
    ['neq', '6000000', false],
  ] as const)('amount %s %s → %s', (op, value, expected) => {
    expect(conditionHolds([{ fact: 'amount', op, value }], facts)).toBe(expected);
  });

  it('un dato que falta o que no es número no cumple', () => {
    expect(conditionHolds([{ fact: 'missing', op: 'eq', value: 1 }], facts)).toBe(false);
    expect(conditionHolds([{ fact: 'type', op: 'gt', value: 1 }], facts)).toBe(false);
    expect(conditionHolds([{ fact: 'type', op: 'eq', value: ['compra'] }], facts)).toBe(false);
    expect(conditionHolds([{ fact: 'type', op: 'in', value: 'compra' }], facts)).toBe(false);
  });
});

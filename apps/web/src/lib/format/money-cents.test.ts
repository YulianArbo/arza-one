import { describe, expect, it } from 'vitest';

import { fromCents, percentOfCents, sumMoney } from './money-cents';

describe('dinero en centavos, sin coma flotante (B22B)', () => {
  it('lee los valores que manda la API', () => {
    expect(sumMoney(['1500000.50'])).toBe(150000050n);
    expect(sumMoney(['1500000.5'])).toBe(150000050n);
    expect(sumMoney(['7'])).toBe(700n);
    expect(sumMoney(['-12.30'])).toBe(-1230n);
    expect(() => sumMoney(['12,30'])).toThrow('Valor de dinero no válido');
  });

  it('suma exacto donde la coma flotante falla', () => {
    expect(fromCents(sumMoney(['0.10', '0.20']))).toBe('0.30');
    expect(fromCents(sumMoney(['84000000.00', '0.01']))).toBe('84000000.01');
    expect(fromCents(sumMoney([]))).toBe('0.00');
    expect(fromCents(-1230n)).toBe('-12.30');
  });

  it('calcula el porcentaje para mostrar, entre 0 y 100', () => {
    expect(percentOfCents(5400n, 8400n)).toBe(64);
    expect(percentOfCents(1n, 0n)).toBe(0);
    expect(percentOfCents(200n, 100n)).toBe(100);
    expect(percentOfCents(-5n, 100n)).toBe(0);
  });
});

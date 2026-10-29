import { describe, expect, it } from 'vitest';

import { exceedsDiscountCap, largestDiscount, quoteTotals } from './quote-totals.js';

// Criterio de aceptación de B23 (ficha 17.6): el total coincide con el cálculo manual al centavo en
// diez casos de prueba. Cada esperado se calculó a mano, línea por línea, redondeando al centavo con
// la mitad hacia arriba; el cierre del bloque los muestra en una tabla.

function line(quantity: string, unit_price: string, discount_percent: string, tax_rate: string) {
  return { quantity, unit_price, discount_percent, tax_rate };
}

const CASES = [
  {
    name: '1. Un servicio sin descuento con IVA del 19 %',
    lines: [line('1', '1000000.00', '0', '19')],
    expected: { subtotal: '1000000.00', discount: '0.00', tax: '190000.00', total: '1190000.00' },
  },
  {
    name: '2. Horas con 5 % de descuento',
    lines: [line('10', '85000', '5', '19')],
    expected: { subtotal: '850000.00', discount: '42500.00', tax: '153425.00', total: '960925.00' },
  },
  {
    name: '3. El impuesto se redondea hacia arriba (18 999,9981)',
    lines: [line('3', '33333.33', '0', '19')],
    expected: { subtotal: '99999.99', discount: '0.00', tax: '19000.00', total: '118999.99' },
  },
  {
    name: '4. Cantidad con decimales, precio con centavos y 7,5 % de descuento',
    lines: [line('1.5', '120000.50', '7.5', '19')],
    expected: { subtotal: '180000.75', discount: '13500.06', tax: '31635.13', total: '198135.82' },
  },
  {
    name: '5. Servicio exento (0 %)',
    lines: [line('2', '450000', '0', '0')],
    expected: { subtotal: '900000.00', discount: '0.00', tax: '0.00', total: '900000.00' },
  },
  {
    name: '6. Descuento del 100 %',
    lines: [line('1', '500000', '100', '19')],
    expected: { subtotal: '500000.00', discount: '500000.00', tax: '0.00', total: '0.00' },
  },
  {
    name: '7. Dos líneas: una gravada con descuento y una exenta',
    lines: [line('12', '1250000', '10', '19'), line('1', '3000000', '0', '0')],
    expected: {
      subtotal: '18000000.00',
      discount: '1500000.00',
      tax: '2565000.00',
      total: '19065000.00',
    },
  },
  {
    name: '8. Medio centavo en el descuento (1,515 → 1,52)',
    lines: [line('1', '10.10', '15', '19')],
    expected: { subtotal: '10.10', discount: '1.52', tax: '1.63', total: '10.21' },
  },
  {
    name: '9. IVA del 5 % con redondeo hacia abajo (4 320,9845)',
    lines: [line('7', '12345.67', '0', '5')],
    expected: { subtotal: '86419.69', discount: '0.00', tax: '4320.98', total: '90740.67' },
  },
  {
    name: '10. Tres líneas que suman centavos redondeados',
    lines: [
      line('0.25', '99999.99', '0', '19'),
      line('40', '75000', '12.5', '19'),
      line('1', '199.99', '3.33', '19'),
    ],
    expected: {
      subtotal: '3025199.99',
      discount: '375006.66',
      tax: '503536.73',
      total: '3153730.06',
    },
  },
] as const;

describe('quoteTotals: diez casos calculados a mano', () => {
  it.each(CASES)('$name', ({ lines, expected }) => {
    const totals = quoteTotals(lines);
    expect({
      subtotal: totals.subtotal,
      discount: totals.discount_total,
      tax: totals.tax_total,
      total: totals.total,
    }).toEqual(expected);
  });

  it('cada línea cuadra: subtotal menos descuento más impuesto', () => {
    for (const { lines } of CASES) {
      for (const item of quoteTotals(lines).lines) {
        const rebuilt = (Number(item.subtotal) - Number(item.discount) + Number(item.tax)).toFixed(
          2,
        );
        expect(rebuilt).toBe(item.total);
      }
    }
  });

  it('agrupa el impuesto por tarifa, de la mayor a la menor', () => {
    const { taxes } = quoteTotals(CASES[6].lines);
    expect(taxes).toEqual([
      { tax_rate: '19.00', base: '13500000.00', tax: '2565000.00' },
      { tax_rate: '0.00', base: '3000000.00', tax: '0.00' },
    ]);
  });

  it('una cotización sin líneas suma cero', () => {
    expect(quoteTotals([])).toMatchObject({ subtotal: '0.00', total: '0.00', taxes: [] });
  });
});

describe('tope de descuento', () => {
  const lines = [{ discount_percent: '5' }, { discount_percent: '12.5' }];

  it('toma el mayor descuento de las líneas', () => {
    expect(largestDiscount(lines)).toBe('12.50');
    expect(largestDiscount([])).toBe('0.00');
  });

  it('pide aprobación solo si un descuento pasa el tope; igual al tope no la pide', () => {
    expect(exceedsDiscountCap(lines, '10')).toBe(true);
    expect(exceedsDiscountCap(lines, '12.5')).toBe(false);
    expect(exceedsDiscountCap([{ discount_percent: '0' }], '0')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import {
  accountingFileName,
  accountingTotals,
  checksumOf,
  toAccountingCsv,
  type AccountingRow,
} from './accounting-csv.js';
import {
  isPastPeriod,
  periodOf,
  periodRange,
  pettyCashBalanceAfter,
  recentPeriods,
  unexplainedDifference,
} from './ledger-rules.js';

const OPEN = { fund: '500000.00', balance: '500000.00', lastDate: '2026-10-01' };

describe('caja menor', () => {
  it('se abre una sola vez con el fondo', () => {
    const empty = { fund: null, balance: '0.00', lastDate: null };
    expect(
      pettyCashBalanceAfter(empty, { type: 'opening', amount: '500000.00', date: '2026-10-01' }),
    ).toEqual({ balance: '500000.00' });
    expect(
      pettyCashBalanceAfter(OPEN, { type: 'opening', amount: '1.00', date: '2026-10-02' }),
    ).toEqual({ problem: 'already_open' });
    expect(
      pettyCashBalanceAfter(empty, { type: 'voucher', amount: '1.00', date: '2026-10-02' }),
    ).toEqual({ problem: 'not_open' });
  });

  it('un vale resta y nunca deja el saldo negativo', () => {
    expect(
      pettyCashBalanceAfter(OPEN, { type: 'voucher', amount: '120000.50', date: '2026-10-02' }),
    ).toEqual({ balance: '379999.50' });
    expect(
      pettyCashBalanceAfter(OPEN, { type: 'voucher', amount: '500000.01', date: '2026-10-02' }),
    ).toEqual({ problem: 'insufficient_balance' });
  });
});

describe('caja menor: reembolsos y orden', () => {
  it('un reembolso suma sin pasar del fondo', () => {
    const spent = { ...OPEN, balance: '100000.00' };
    expect(
      pettyCashBalanceAfter(spent, {
        type: 'replenishment',
        amount: '400000.00',
        date: '2026-10-03',
      }),
    ).toEqual({ balance: '500000.00' });
    expect(
      pettyCashBalanceAfter(spent, {
        type: 'replenishment',
        amount: '400000.01',
        date: '2026-10-03',
      }),
    ).toEqual({ problem: 'over_fund' });
  });

  it('los movimientos van en orden de fecha', () => {
    expect(
      pettyCashBalanceAfter(OPEN, { type: 'voucher', amount: '1.00', date: '2026-09-30' }),
    ).toEqual({ problem: 'date_before_last' });
  });
});

describe('conciliación y meses', () => {
  it('cuadra cuando las partidas explican la diferencia', () => {
    const items = [{ amount: '-15000.00' }, { amount: '2500.25' }];
    expect(unexplainedDifference('1000000.00', '987500.25', items)).toBe('0.00');
    expect(unexplainedDifference('1000000.00', '987500.00', items)).toBe('-0.25');
  });

  it('calcula los meses contables', () => {
    expect(periodOf('2026-02-14')).toBe('2026-02');
    expect(periodRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(isPastPeriod('2026-10', '2026-11-11')).toBe(true);
    expect(isPastPeriod('2026-11', '2026-11-11')).toBe(false);
    expect(recentPeriods('2026-02-10', 3)).toEqual(['2026-02', '2026-01', '2025-12']);
  });
});

const ROWS: AccountingRow[] = [
  {
    date: '2026-10-05',
    type: 'invoice',
    number: 'FE-1001',
    taxId: '900123456-7',
    party: 'Cliente; Ficticio "SAS"',
    costCenter: null,
    category: null,
    amount: '1190.00',
    reference: 'FAC-2026-0001',
  },
  {
    date: '2026-10-06',
    type: 'expense',
    number: 'GAS-2026-0001',
    taxId: null,
    party: null,
    costCenter: 'CC-01',
    category: '=SUMA(A1)',
    amount: '50.25',
    reference: null,
  },
  rowOf('expense', '49.75'),
];

function rowOf(type: AccountingRow['type'], amount: string): AccountingRow {
  return {
    date: '2026-10-07',
    type,
    number: 'X',
    taxId: null,
    party: null,
    costCenter: null,
    category: null,
    amount,
    reference: null,
  };
}

describe('archivo contable', () => {
  it('escribe CSV con punto y coma, coma decimal y celdas a salvo de fórmulas', () => {
    const csv = toAccountingCsv(ROWS);
    const lines = csv.slice(1).split('\r\n');
    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines[0]).toBe(
      'fecha;tipo;numero;nit_tercero;tercero;centro_costo;rubro;valor;referencia',
    );
    expect(lines[1]).toBe(
      '2026-10-05;FACTURA;FE-1001;900123456-7;"Cliente; Ficticio ""SAS""";;;1190,00;FAC-2026-0001',
    );
    expect(lines[2]).toBe("2026-10-06;GASTO;GAS-2026-0001;;;CC-01;'=SUMA(A1);50,25;");
  });

  it('suma cada tipo de movimiento', () => {
    expect(accountingTotals(ROWS)).toEqual({
      invoice: '1190.00',
      credit_note: '0.00',
      payment: '0.00',
      expense: '100.00',
      petty_cash: '0.00',
    });
  });

  it('da la misma huella al mismo archivo y nombra el lote', () => {
    expect(checksumOf(toAccountingCsv(ROWS))).toBe(checksumOf(toAccountingCsv(ROWS)));
    expect(checksumOf('a')).not.toBe(checksumOf('b'));
    expect(accountingFileName('2026-10', 'definitive')).toBe('contabilidad-2026-10-definitivo.csv');
    expect(accountingFileName('2026-11', 'preliminary')).toBe(
      'contabilidad-2026-11-preliminar.csv',
    );
  });
});

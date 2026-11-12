import { createHash } from 'node:crypto';

import type { ExportRowType, ExportTotals } from '@arza/contracts';

import { Money } from './ledger-rules.js';

// Archivo contable del B32 (decisión 1): CSV en UTF-8 con BOM, separado por punto y coma y con coma
// decimal, como lo abre la hoja de cálculo en Colombia. Una fila por movimiento del mes. Formato
// pendiente de validación del Contador.

export interface AccountingRow {
  readonly date: string;
  readonly type: ExportRowType;
  readonly number: string;
  readonly taxId: string | null;
  readonly party: string | null;
  readonly costCenter: string | null;
  readonly category: string | null;
  /** Valor positivo con punto decimal y dos decimales, como 1190.00. */
  readonly amount: string;
  readonly reference: string | null;
}

export const ACCOUNTING_HEADER = [
  'fecha',
  'tipo',
  'numero',
  'nit_tercero',
  'tercero',
  'centro_costo',
  'rubro',
  'valor',
  'referencia',
] as const;

const TYPE_LABELS: Readonly<Record<ExportRowType, string>> = {
  invoice: 'FACTURA',
  credit_note: 'NOTA_CREDITO',
  payment: 'RECAUDO',
  expense: 'GASTO',
  petty_cash: 'CAJA_MENOR',
};

const BOM = '﻿';

/** Una celda que empieza por =, +, -, @, tabulador o retorno se antepone con apóstrofo. */
function neutralized(value: string): string {
  return /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
}

function cell(value: string | null): string {
  if (value === null) return '';
  const text = neutralized(value);
  return /[";\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** 1190.00 → 1190,00 (sin separador de miles, para que la hoja lo lea como número). */
function decimalComma(amount: string): string {
  return amount.replace('.', ',');
}

function line(row: AccountingRow): string {
  return [
    cell(row.date),
    TYPE_LABELS[row.type],
    cell(row.number),
    cell(row.taxId),
    cell(row.party),
    cell(row.costCenter),
    cell(row.category),
    decimalComma(row.amount),
    cell(row.reference),
  ].join(';');
}

export function toAccountingCsv(rows: readonly AccountingRow[]): string {
  const lines = [ACCOUNTING_HEADER.join(';'), ...rows.map(line)];
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** Suma de cada tipo de movimiento, para comprobar que el archivo cuadra con lo registrado. */
export function accountingTotals(rows: readonly AccountingRow[]): ExportTotals {
  const sums: Record<ExportRowType, InstanceType<typeof Money>> = {
    invoice: new Money(0),
    credit_note: new Money(0),
    payment: new Money(0),
    expense: new Money(0),
    petty_cash: new Money(0),
  };
  for (const row of rows) sums[row.type] = sums[row.type].plus(row.amount);
  return {
    invoice: sums.invoice.toFixed(2),
    credit_note: sums.credit_note.toFixed(2),
    payment: sums.payment.toFixed(2),
    expense: sums.expense.toFixed(2),
    petty_cash: sums.petty_cash.toFixed(2),
  };
}

/** Huella SHA-256 del archivo: la misma huella prueba que una nueva descarga es idéntica. */
export function checksumOf(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** contabilidad-2026-10-definitivo.csv */
export function accountingFileName(period: string, kind: 'preliminary' | 'definitive'): string {
  return `contabilidad-${period}-${kind === 'definitive' ? 'definitivo' : 'preliminar'}.csv`;
}

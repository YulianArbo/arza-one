import { NOVELTY_SOURCES, NOVELTY_UNITS, type NoveltySource, type NoveltyUnit } from './payroll.js';

// Archivo de novedades del mes para el software de nómina (B36, decisión 6): CSV en UTF-8 con marca
// de orden, separado por punto y coma y con coma decimal, como lo abre la hoja de cálculo en
// Colombia (igual que el archivo contable de B32). Solo sale de un mes cerrado. Formato por validar
// con Talento humano y el proveedor de nómina.

export interface NoveltyFileRow {
  readonly period: string;
  readonly idNumber: string | null;
  readonly employee: string;
  readonly concept: string;
  readonly conceptLabel: string;
  /** Con punto decimal, como 2.50. */
  readonly quantity: string;
  readonly unit: NoveltyUnit;
  readonly amount: string | null;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly source: NoveltySource;
  readonly note: string | null;
}

export const NOVELTY_FILE_COLUMNS = [
  'periodo',
  'documento',
  'colaborador',
  'codigo_concepto',
  'concepto',
  'cantidad',
  'unidad',
  'valor',
  'desde',
  'hasta',
  'origen',
  'nota',
] as const;

const BOM = '﻿';

/** 2026-11-12 → 12/11/2026. */
function displayDate(date: string | null): string {
  if (date === null) return '';
  const [year = '', month = '', day = ''] = date.split('-');
  return `${day}/${month}/${year}`;
}

function csvCell(value: string): string {
  // Una celda que empieza con =, +, -, @, tabulador o retorno se guarda como texto.
  const safe = /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
  return /[";\n\r]/u.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function decimalComma(value: string): string {
  return value.replace('.', ',');
}

function fileRow(row: NoveltyFileRow): string[] {
  return [
    row.period,
    row.idNumber ?? '',
    row.employee,
    row.concept,
    row.conceptLabel,
    decimalComma(row.quantity),
    NOVELTY_UNITS[row.unit],
    row.amount === null ? '' : decimalComma(row.amount),
    displayDate(row.startsOn),
    displayDate(row.endsOn),
    NOVELTY_SOURCES[row.source],
    row.note ?? '',
  ];
}

/** Las novedades del mes como CSV. */
export function noveltiesCsv(rows: readonly NoveltyFileRow[]): string {
  const lines = [[...NOVELTY_FILE_COLUMNS], ...rows.map(fileRow)];
  return `${BOM}${lines.map((line) => line.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

/** novedades-nomina-2026-11.csv */
export function noveltiesFileName(period: string): string {
  return `novedades-nomina-${period}.csv`;
}

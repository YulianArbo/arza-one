// Hojas CSV de la exportación completa (B48, decisión 5): UTF-8 con BOM y punto y coma, para
// abrir en Excel con la configuración de Colombia. A diferencia de los informes, aquí los datos
// salen tal cual: un número negativo sigue siendo número. Solo un texto que Excel tomaría por
// fórmula (=, +, @, o un guion que no inicia un número) lleva un apóstrofo delante.

export const CSV_BOM = '﻿';
const SEPARATOR = ';';
const LINE = '\r\n';

function looksLikeFormula(text: string): boolean {
  return /^[=+@\t\r]/u.test(text) || /^-(?![\d.])/u.test(text);
}

function quoted(text: string): string {
  return /[";\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Texto de una celda: números y fechas tal cual, objetos como JSON, null vacío. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return quoted(looksLikeFormula(text) ? `'${text}` : text);
}

export function csvHeader(columns: readonly string[]): string {
  return `${CSV_BOM}${columns.map(quoted).join(SEPARATOR)}${LINE}`;
}

export function csvLine(
  columns: readonly string[],
  row: Readonly<Record<string, unknown>>,
): string {
  return `${columns.map((column) => csvCell(row[column])).join(SEPARATOR)}${LINE}`;
}

// Archivos CSV para abrir en Excel con la configuración de Colombia (B19, B22): UTF-8 con BOM y
// separados por punto y coma. Los usan el Listado Maestro y el informe del embudo.

export type CsvCell = string | null;

export const CSV_BOM = '﻿';
const SEPARATOR = ';';

/**
 * Una celda que empieza por =, +, -, @, tabulador o retorno se tomaría como fórmula al abrir el
 * archivo (inyección de fórmulas); se antepone un apóstrofo para que quede como texto.
 */
function neutralized(value: string): string {
  return /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
}

function cell(value: CsvCell): string {
  if (value === null) return '';
  const text = neutralized(value);
  return /[";\r\n,]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(cell).join(SEPARATOR));
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}

// Formato de la exportación de la auditoría: CSV en UTF-8 con BOM (para que la hoja de cálculo
// reconozca las tildes) y separado por comas.

export type CsvCell = string | number | null;

const BOM = '﻿';

/**
 * Una celda que empieza por =, +, -, @, tabulador o retorno se tomaría como fórmula al abrir el
 * archivo (inyección de fórmulas); se antepone un apóstrofo para que quede como texto.
 */
function neutralized(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function cell(value: CsvCell): string {
  if (value === null) return '';
  const text = typeof value === 'number' ? String(value) : neutralized(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(cell).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

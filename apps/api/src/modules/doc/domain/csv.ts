// CSV del Listado Maestro (B19): se escribe en UTF-8 con BOM y separado por punto y coma, como lo
// guarda y lo abre Excel con la configuración de Colombia; se lee separado por punto y coma o por
// comas, con comillas dobles para los textos que llevan el separador.

export type CsvCell = string | null;

const BOM = '﻿';
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
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** El separador del archivo: el que aparece en la primera línea fuera de comillas. */
function separatorOf(text: string): string {
  const firstLine = text.split(/\r?\n/u, 1)[0] ?? '';
  const outside = firstLine.replace(/"[^"]*"/gu, '');
  return outside.includes(';') ? ';' : ',';
}

interface Reading {
  readonly rows: string[][];
  row: string[];
  value: string;
  quoted: boolean;
}

function endRow(state: Reading): void {
  state.row.push(state.value);
  state.value = '';
  if (state.row.some((value) => value.trim() !== '')) state.rows.push(state.row);
  state.row = [];
}

function readChar(state: Reading, text: string, index: number, separator: string): number {
  const char = text.charAt(index);
  if (state.quoted) {
    if (char === '"' && text.charAt(index + 1) === '"') {
      state.value += '"';
      return index + 2;
    }
    if (char === '"') state.quoted = false;
    else state.value += char;
    return index + 1;
  }
  if (char === '"') state.quoted = true;
  else if (char === separator) {
    state.row.push(state.value);
    state.value = '';
  } else if (char === '\n') endRow(state);
  else if (char !== '\r') state.value += char;
  return index + 1;
}

/** Filas del archivo, sin las vacías. Acepta el BOM de Excel y los finales de línea de Windows. */
export function parseCsv(input: string): string[][] {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const separator = separatorOf(text);
  const state: Reading = { rows: [], row: [], value: '', quoted: false };
  let index = 0;
  while (index < text.length) index = readChar(state, text, index, separator);
  endRow(state);
  return state.rows;
}

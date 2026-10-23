// CSV del Listado Maestro (B19): se escribe con el formato común de la plataforma (UTF-8 con BOM y
// punto y coma, para Excel en Colombia); se lee separado por punto y coma o por comas, con comillas
// dobles para los textos que llevan el separador.

import { CSV_BOM } from '../../../platform/export/csv.js';

export { toCsv } from '../../../platform/export/csv.js';

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
  const text = input.startsWith(CSV_BOM) ? input.slice(1) : input;
  const separator = separatorOf(text);
  const state: Reading = { rows: [], row: [], value: '', quoted: false };
  let index = 0;
  while (index < text.length) index = readChar(state, text, index, separator);
  endRow(state);
  return state.rows;
}

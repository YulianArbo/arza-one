import {
  createRetentionRuleSchema,
  type CreateRetentionRule,
  type RetentionDisposition,
} from '@arza/contracts';

import { parseCsv } from './csv.js';
import { normalized } from './master-list-format.js';

// Lectura de la Tabla de Retención RE-SGC-005 para cargarla (B21, numeral 18.2, paso 4): cada
// fila es una serie con su código, a qué tipo o proceso se aplica, sus años y su disposición. Cada
// fila se revisa sola con el mismo contrato de la API; los tipos y procesos de la empresa los
// revisa después el importador. Ninguna fila con problemas se carga.

/** Una fila válida, con el proceso aún por su código. */
export interface RetentionTableRow {
  readonly row: number;
  readonly processCode: string | null;
  readonly rule: Omit<CreateRetentionRule, 'process_id'>;
}

export interface RetentionTableProblem {
  readonly row: number;
  readonly code: string | null;
  readonly problem: string;
}

export interface RetentionTable {
  readonly rows: readonly RetentionTableRow[];
  readonly problems: readonly RetentionTableProblem[];
}

const COLUMNS = {
  code: 'codigo',
  name: 'serie',
  type: 'tipo',
  process: 'proceso',
  active: 'anos gestion',
  archive: 'anos central',
  disposition: 'disposicion',
  basis: 'fundamento',
} as const;

type Column = keyof typeof COLUMNS;
type Cells = Readonly<Partial<Record<Column, string>>>;

/**
 * El proceso de la fila se resuelve después, por su código; para revisar la fila con el contrato
 * basta saber que lo tiene.
 */
const SOME_PROCESS = '00000000-0000-7000-8000-000000000000';

const REQUIRED: readonly Column[] = ['code', 'name', 'active', 'archive', 'disposition', 'basis'];

const DISPOSITIONS: Readonly<Record<string, RetentionDisposition>> = {
  eliminar: 'destroy',
  eliminacion: 'destroy',
  'conservacion total': 'keep',
  conservar: 'keep',
};

/** Qué columna es cada encabezado: «Años gestión» y «Anos gestion» valen igual. */
function columnsOf(header: readonly string[]): Map<number, Column> {
  const wanted = Object.entries(COLUMNS) as [Column, string][];
  const found = new Map<number, Column>();
  header.forEach((title, index) => {
    const match = wanted.find(([, name]) => normalized(title) === name);
    if (match !== undefined) found.set(index, match[0]);
  });
  return found;
}

function cellsOf(values: readonly string[], columns: ReadonlyMap<number, Column>): Cells {
  const cells: Partial<Record<Column, string>> = {};
  for (const [index, column] of columns) cells[column] = (values[index] ?? '').trim();
  return cells;
}

/** El texto de la celda en mayúsculas; null si está vacía. */
function textOf(text: string | undefined): string | null {
  return text === undefined || text === '' ? null : text.toUpperCase();
}

function years(text: string | undefined): number {
  return /^\d{1,3}$/u.test(text ?? '') ? Number(text) : Number.NaN;
}

/** La fila como la pide el contrato, o el primer problema que tiene. */
function readRow(cells: Cells, row: number): RetentionTableRow | RetentionTableProblem {
  const code = textOf(cells.code);
  const processCode = textOf(cells.process);
  const disposition = DISPOSITIONS[normalized(cells.disposition ?? '')];
  if (disposition === undefined) {
    return { row, code, problem: 'la disposición debe ser «Eliminar» o «Conservación total»' };
  }
  const parsed = createRetentionRuleSchema.safeParse({
    code: code ?? '',
    name: cells.name ?? '',
    doc_type: textOf(cells.type),
    process_id: processCode === null ? null : SOME_PROCESS,
    active_years: years(cells.active),
    archive_years: years(cells.archive),
    disposition,
    legal_basis: cells.basis ?? '',
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join('.') ?? '';
    return {
      row,
      code,
      problem: `revise ${field === '' ? 'la fila' : `«${field}»`}: ${issue?.message ?? ''}`,
    };
  }
  const { data } = parsed;
  const rule = {
    code: data.code,
    name: data.name,
    doc_type: data.doc_type,
    active_years: data.active_years,
    archive_years: data.archive_years,
    disposition: data.disposition,
    legal_basis: data.legal_basis,
  };
  return { row, processCode, rule };
}

export function readRetentionTable(csv: string): RetentionTable {
  const [header = [], ...lines] = parseCsv(csv);
  const columns = columnsOf(header);
  const missing = REQUIRED.filter((column) => ![...columns.values()].includes(column));
  if (missing.length > 0) {
    const names = missing.map((column) => COLUMNS[column]).join(', ');
    return {
      rows: [],
      problems: [{ row: 1, code: null, problem: `faltan las columnas: ${names}` }],
    };
  }
  const rows: RetentionTableRow[] = [];
  const problems: RetentionTableProblem[] = [];
  const seen = new Set<string>();
  lines.forEach((values, index) => {
    const read = readRow(cellsOf(values, columns), index + 2);
    if ('problem' in read) problems.push(read);
    else if (seen.has(read.rule.code)) {
      problems.push({ row: read.row, code: read.rule.code, problem: 'el código está repetido' });
    } else {
      seen.add(read.rule.code);
      rows.push(read);
    }
  });
  return { rows, problems };
}

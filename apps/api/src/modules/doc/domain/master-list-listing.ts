import { TYPES_WITHOUT_PROCESS, type Classification } from '@arza/contracts';

import { isoDateOf, normalized } from './master-list-format.js';

// Lectura del Listado Maestro RE-SGC-001 para la carga inicial (B19, numeral 18.2, paso 1). Cada
// fila se revisa sola: el código de PR-SGC-001, la versión, la fecha, el estado y la
// clasificación. Lo que depende de la empresa (tipos, procesos, cargos y archivos) lo revisa
// después el importador. Ninguna fila con problemas se carga.

/** Una fila válida del listado, lista para cargarse. */
export interface ListingEntry {
  readonly row: number;
  readonly code: string;
  readonly title: string;
  readonly docType: string;
  /** Código del proceso tomado del código del documento; null en los tipos sin proceso (RIT). */
  readonly processCode: string | null;
  readonly number: number;
  readonly effectiveDate: string;
  readonly owner: string | null;
  readonly targets: readonly string[];
  readonly classification: Classification;
  readonly fileName: string | null;
}

export interface RowProblem {
  readonly row: number;
  readonly code: string | null;
  readonly problem: string;
}

export interface Listing {
  readonly entries: readonly ListingEntry[];
  /** Filas que no están vigentes: el listado las conserva, pero no se cargan. */
  readonly skipped: readonly RowProblem[];
  readonly problems: readonly RowProblem[];
}

const COLUMNS = {
  code: 'codigo',
  title: 'nombre',
  type: 'tipo',
  process: 'proceso',
  version: 'version',
  date: 'fecha',
  status: 'estado',
  owner: 'responsable',
  targets: 'destinatarios',
  classification: 'clasificacion',
  file: 'archivo',
} as const;

type Column = keyof typeof COLUMNS;
const COLUMN_KEYS: readonly Column[] = [
  'code',
  'title',
  'type',
  'process',
  'version',
  'date',
  'status',
  'owner',
  'targets',
  'classification',
  'file',
];
const REQUIRED: readonly Column[] = ['code', 'title', 'version', 'date'];

const CLASSIFICATIONS: Readonly<Record<string, Classification>> = {
  publico: 'public',
  interno: 'internal',
  confidencial: 'confidential',
  restringido: 'restricted',
};

const CODE = /^([A-Z]{2,3})-(?:([A-Z]{2,3})-)?(\d{3,8})$/u;

type Cells = Readonly<Partial<Record<Column, string>>>;

/** Qué columna es cada encabezado; los que no se reconocen se ignoran. */
function headerIndex(header: readonly string[]): Map<Column, number> {
  const titles = header.map(normalized);
  const index = new Map<Column, number>();
  for (const column of COLUMN_KEYS) {
    const position = titles.indexOf(COLUMNS[column]);
    if (position >= 0) index.set(column, position);
  }
  return index;
}

function cellsOf(row: readonly string[], index: ReadonlyMap<Column, number>): Cells {
  const cells: Partial<Record<Column, string>> = {};
  for (const [column, position] of index) cells[column] = (row[position] ?? '').trim();
  return cells;
}

interface CodeParts {
  readonly docType: string;
  readonly processCode: string | null;
}

function codeParts(code: string): CodeParts | string {
  const match = CODE.exec(code);
  if (match === null) return 'el código no tiene la forma TIPO-PROCESO-NNN';
  const [, docType = '', processCode] = match;
  const withoutProcess = TYPES_WITHOUT_PROCESS.includes(docType);
  if (withoutProcess !== (processCode === undefined)) {
    return withoutProcess ? 'este tipo no lleva proceso' : 'falta el proceso en el código';
  }
  return { docType, processCode: processCode ?? null };
}

function versionNumber(text: string): number | null {
  if (!/^\d{1,2}$/u.test(text)) return null;
  return Number(text);
}

function targetsOf(text: string | undefined): string[] {
  if (text === undefined || text === '') return [];
  return text
    .split(/[|,]/u)
    .map((name) => name.trim())
    .filter((name) => name !== '');
}

/** El problema de la fila, si tiene uno; si no, la entrada lista para cargar. */
function entryOf(row: number, cells: Cells): ListingEntry | string {
  const code = (cells.code ?? '').toUpperCase();
  const parts = codeParts(code);
  if (typeof parts === 'string') return parts;
  if ((cells.title ?? '').length < 3) return 'el nombre es muy corto';
  if (cells.type !== undefined && cells.type !== '' && cells.type.toUpperCase() !== parts.docType) {
    return 'el tipo no coincide con el código';
  }
  const process = cells.process?.toUpperCase();
  if (process !== undefined && process !== '' && process !== parts.processCode) {
    return 'el proceso no coincide con el código';
  }
  const number = versionNumber(cells.version ?? '');
  if (number === null) return 'la versión debe ser un número de 0 a 99';
  const effectiveDate = isoDateOf(cells.date ?? '');
  if (effectiveDate === null) return 'la fecha debe ser dd/mm/aaaa';
  const classification = CLASSIFICATIONS[normalized(cells.classification ?? '') || 'interno'];
  if (classification === undefined)
    return 'la clasificación no es pública, interna, confidencial ni restringida';
  return {
    row,
    code,
    title: cells.title ?? '',
    ...parts,
    number,
    effectiveDate,
    owner: cells.owner === undefined || cells.owner === '' ? null : cells.owner,
    targets: targetsOf(cells.targets),
    classification,
    fileName: cells.file === undefined || cells.file === '' ? null : cells.file,
  };
}

function isCurrent(cells: Cells): boolean {
  const status = normalized(cells.status ?? '');
  return status === '' || status === 'vigente';
}

/** Lee las filas del CSV (la primera es el encabezado). La fila 2 es la primera de datos. */
export function readListing(rows: readonly (readonly string[])[]): Listing {
  const [header = [], ...data] = rows;
  const index = headerIndex(header);
  const missing = REQUIRED.filter((column) => !index.has(column));
  if (missing.length > 0) {
    const names = missing.map((column) => COLUMNS[column]).join(', ');
    return {
      entries: [],
      skipped: [],
      problems: [{ row: 1, code: null, problem: `faltan las columnas: ${names}` }],
    };
  }
  const entries: ListingEntry[] = [];
  const skipped: RowProblem[] = [];
  const problems: RowProblem[] = [];
  const seen = new Set<string>();
  data.forEach((row, offset) => {
    const number = offset + 2;
    const cells = cellsOf(row, index);
    const code = (cells.code ?? '').toUpperCase() || null;
    if (!isCurrent(cells)) {
      skipped.push({ row: number, code, problem: `estado «${cells.status ?? ''}»: no se carga` });
      return;
    }
    const entry = entryOf(number, cells);
    if (typeof entry === 'string') problems.push({ row: number, code, problem: entry });
    else if (seen.has(entry.code))
      problems.push({ row: number, code, problem: 'el código está repetido' });
    else {
      seen.add(entry.code);
      entries.push(entry);
    }
  });
  return { entries, skipped, problems };
}

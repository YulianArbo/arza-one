// Lectura de las plantillas de la carga inicial (B45): la primera fila trae los encabezados, que se
// reconocen sin importar tildes, mayúsculas, espacios ni signos («Proceso o área» = «proceso o
// area»). Los encabezados que no se reconocen se ignoran; los obligatorios que faltan se informan.

export interface SheetProblem {
  /** Fila del archivo como la ve Excel (el encabezado es la 1); 0 si es del archivo entero. */
  readonly row: number;
  /** El código, el nombre, el correo o el NIT de la fila, para encontrarla. */
  readonly key: string | null;
  readonly problem: string;
}

export type Cells<C extends string> = Readonly<Partial<Record<C, string>>>;

interface SheetRow<C extends string> {
  readonly row: number;
  readonly cells: Cells<C>;
}

export interface SheetColumns<C extends string> {
  /** El encabezado de cada columna, ya normalizado (sin tildes ni signos, en minúsculas). */
  readonly headers: Readonly<Record<C, readonly string[]>>;
  readonly required: readonly C[];
  /** Cómo se llama cada columna obligatoria en la plantilla, para el mensaje. */
  readonly labels: Readonly<Record<C, string>>;
}

export interface Sheet<C extends string> {
  readonly rows: readonly SheetRow<C>[];
  readonly problems: readonly SheetProblem[];
}

/** «Proceso o área» → «procesoarea»: sin tildes, signos, espacios ni la «o» suelta. */
export function normalizedHeader(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((word) => word !== '' && word !== 'o' && word !== 'de' && word !== 'y')
    .join('');
}

function columnOf<C extends string>(columns: SheetColumns<C>, header: string): C | null {
  const wanted = normalizedHeader(header);
  const keys = Object.keys(columns.headers) as C[];
  return keys.find((key) => columns.headers[key].includes(wanted)) ?? null;
}

function cellsOf<C extends string>(order: readonly (C | null)[], values: readonly string[]) {
  const cells: Partial<Record<C, string>> = {};
  order.forEach((column, index) => {
    const value = values[index]?.trim() ?? '';
    if (column !== null && value !== '') cells[column] = value;
  });
  return cells;
}

/**
 * Filas de la plantilla con sus celdas por columna. Un archivo vacío (o que no está) no tiene filas;
 * sin los encabezados obligatorios, ninguna fila se lee.
 */
export function readSheet<C extends string>(
  parsed: readonly (readonly string[])[],
  columns: SheetColumns<C>,
): Sheet<C> {
  const [header, ...body] = parsed;
  if (header === undefined) return { rows: [], problems: [] };
  const order = header.map((title) => columnOf(columns, title));
  const missing = columns.required.filter((column) => !order.includes(column));
  if (missing.length > 0) {
    const names = missing.map((column) => columns.labels[column]).join(', ');
    return { rows: [], problems: [{ row: 1, key: null, problem: `faltan las columnas ${names}` }] };
  }
  return {
    rows: body.map((values, index) => ({ row: index + 2, cells: cellsOf(order, values) })),
    problems: [],
  };
}

/** Valores de una celda con varios, separados por barra vertical, coma o punto y coma. */
export function listOf(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(/[|,;]/u)
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/** Las filas que repiten la clave de una anterior. */
export function repeatedKeys<T>(items: readonly T[], keyOf: (item: T) => string): Set<T> {
  const seen = new Set<string>();
  const repeated = new Set<T>();
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) repeated.add(item);
    seen.add(key);
  }
  return repeated;
}

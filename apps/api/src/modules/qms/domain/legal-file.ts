import {
  LEGAL_IMPORT_COLUMNS,
  LEGAL_NORM_TYPES,
  saveLegalRequirementSchema,
  type LegalNormType,
  type SaveLegalRequirement,
} from '@arza/contracts';

// Lectura del archivo del normograma (B46, decisión 6). Solo revisa el texto: si el proceso
// existe y si el requisito ya está en el normograma lo decide la carga, con la base de datos.

export const MAX_IMPORT_ROWS = 1000;

/** Una fila leída: el requisito (con el código del proceso aparte) o sus errores. */
export interface LegalFileRow {
  readonly line: number;
  readonly norm: string;
  readonly article: string | null;
  readonly processCode: string | null;
  readonly input: Omit<SaveLegalRequirement, 'process_id'> | null;
  readonly errors: readonly string[];
}

export type LegalFileReading =
  | { readonly ok: true; readonly rows: readonly LegalFileRow[] }
  | { readonly ok: false; readonly error: string };

const NORM_TYPE_BY_LABEL = new Map<string, LegalNormType>(
  Object.entries(LEGAL_NORM_TYPES).map(([key, label]) => [
    label.toLocaleLowerCase('es-CO'),
    key as LegalNormType,
  ]),
);

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('es-CO');
}

/** Clave que identifica un requisito: la norma y sus artículos, sin mayúsculas ni espacios. */
export function requirementKey(norm: string, article: string | null): string {
  return `${normalized(norm)}|${normalized(article ?? '')}`;
}

function appliesOf(value: string): boolean | null {
  const text = normalized(value);
  if (text === '' || text === 'sí' || text === 'si') return true;
  return text === 'no' ? false : null;
}

function optional(value: string | undefined): string | null {
  const text = (value ?? '').trim();
  return text === '' ? null : text;
}

function readRow(cells: readonly string[], line: number): LegalFileRow {
  const [type = '', norm = '', issuer = '', article, requirement = '', means, process, applies] =
    cells;
  const errors: string[] = [];
  const normType = NORM_TYPE_BY_LABEL.get(normalized(type));
  if (normType === undefined) errors.push(`El tipo de norma «${type.trim()}» no existe.`);
  const appliesValue = appliesOf(applies ?? '');
  if (appliesValue === null) errors.push('En «Aplica» escriba «Sí» o «No».');
  const parsed = saveLegalRequirementSchema.safeParse({
    norm_type: normType ?? 'other',
    norm,
    issuer,
    article: optional(article),
    requirement,
    compliance_means: optional(means),
    applies: appliesValue ?? true,
  });
  if (!parsed.success) {
    errors.push(...parsed.error.issues.map((issue) => fieldMessage(String(issue.path[0]))));
  }
  return {
    line,
    norm: norm.trim(),
    article: optional(article),
    processCode: optional(process),
    input: errors.length === 0 && parsed.success ? parsed.data : null,
    errors,
  };
}

const FIELD_LABELS: Readonly<Record<string, string>> = {
  norm: 'Norma (de 3 a 200 caracteres)',
  issuer: 'Entidad que la expide (de 2 a 160 caracteres)',
  article: 'Artículos (hasta 200 caracteres)',
  requirement: 'Requisito (de 5 a 2000 caracteres)',
  compliance_means: 'Cómo se cumple (hasta 2000 caracteres)',
};

function fieldMessage(field: string): string {
  return `Revise la columna ${FIELD_LABELS[field] ?? field}.`;
}

function headerError(header: readonly string[]): string | null {
  const names = header.map((name) => name.trim());
  const missing = LEGAL_IMPORT_COLUMNS.filter((column, index) => names[index] !== column);
  if (missing.length === 0) return null;
  return `El archivo debe tener, en este orden, las columnas: ${LEGAL_IMPORT_COLUMNS.join('; ')}.`;
}

/** Revisa el encabezado y cada fila; marca las filas repetidas dentro del mismo archivo. */
export function readLegalFile(table: readonly (readonly string[])[]): LegalFileReading {
  const [header, ...body] = table;
  if (header === undefined || body.length === 0) {
    return { ok: false, error: 'El archivo no tiene requisitos.' };
  }
  const problem = headerError(header);
  if (problem !== null) return { ok: false, error: problem };
  if (body.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `Cargue a lo sumo ${String(MAX_IMPORT_ROWS)} requisitos por archivo.`,
    };
  }
  const seen = new Set<string>();
  const rows = body.map((cells, index) => {
    const row = readRow(cells, index + 2);
    const key = requirementKey(row.norm, row.article);
    if (!seen.has(key)) {
      seen.add(key);
      return row;
    }
    return { ...row, input: null, errors: [...row.errors, 'La norma y los artículos se repiten.'] };
  });
  return { ok: true, rows };
}

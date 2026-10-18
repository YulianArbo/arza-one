import { MAX_FILE_BYTES, type AllowedFileType } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { activePositions, activeProcesses, catalogLabels } from '../../core/index.js';
import { isVersionSource } from '../domain/document-rules.js';
import { detectFileType } from '../domain/file-rules.js';
import { normalized } from '../domain/master-list-format.js';
import type { ListingEntry, RowProblem } from '../domain/master-list-listing.js';
import { DOCUMENT_TYPES_CATALOG } from './doc-references.js';

// Lo que la carga inicial necesita de la empresa (B19, numeral 18.2): el tipo del catálogo, el
// proceso, su carpeta del SGC, los cargos por su nombre y el archivo de cada documento en la
// carpeta de la carga. Una fila que no encuentra lo suyo no se carga y queda en el informe.

/** La carpeta de los archivos de la carga: sus nombres y su contenido. */
export interface ImportFiles {
  names(): readonly string[];
  read(name: string): Promise<Buffer>;
}

/** Una fila lista para cargarse, con lo de la empresa ya resuelto. */
export interface PreparedEntry extends ListingEntry {
  readonly processId: string | null;
  readonly folderId: string;
  readonly ownerPositionId: string | null;
  readonly targetPositionIds: readonly string[];
  readonly file: { readonly name: string; readonly type: AllowedFileType; readonly size: number };
}

interface Company {
  readonly types: ReadonlySet<string>;
  readonly processes: ReadonlyMap<string, string>;
  readonly folders: ReadonlyMap<string, string>;
  readonly positions: ReadonlyMap<string, string>;
}

async function companyOf(tx: TenantTransaction): Promise<Company> {
  const folders = await tx.docFolder.findMany({
    where: { code: { startsWith: 'SGC' }, deletedAt: null },
    select: { id: true, code: true },
  });
  return {
    types: new Set((await catalogLabels(tx, DOCUMENT_TYPES_CATALOG)).keys()),
    processes: new Map((await activeProcesses(tx)).map((process) => [process.code, process.id])),
    folders: new Map(folders.map((folder) => [folder.code ?? '', folder.id])),
    positions: new Map(
      (await activePositions(tx)).map((position) => [normalized(position.name), position.id]),
    ),
  };
}

/** El archivo de la fila: el que dice la columna Archivo, o el único que empieza por el código. */
/** El nombre del archivo, o el problema para encontrarlo (que no es ninguno de los nombres). */
function fileNameOf(entry: ListingEntry, names: readonly string[]): string {
  if (entry.fileName !== null) {
    return names.includes(entry.fileName) ? entry.fileName : 'no está el archivo indicado';
  }
  const prefix = entry.code.toLowerCase();
  const matches = names.filter((name) => {
    const lower = name.toLowerCase();
    return lower.startsWith(prefix) && !/[0-9]/u.test(lower.charAt(prefix.length));
  });
  if (matches.length === 0) return 'no hay un archivo que empiece por el código';
  if (matches.length > 1) return 'hay varios archivos que empiezan por el código';
  return matches[0] ?? '';
}

async function fileOf(
  entry: ListingEntry,
  files: ImportFiles,
): Promise<PreparedEntry['file'] | string> {
  const name = fileNameOf(entry, files.names());
  if (!files.names().includes(name)) return name;
  const content = await files.read(name);
  const type = detectFileType(content);
  if (type === null || !isVersionSource(type)) return 'el archivo no es un PDF, Word ni Excel';
  if (content.length === 0 || content.length > MAX_FILE_BYTES) {
    return 'el archivo está vacío o pasa de 20 MB';
  }
  return { name, type, size: content.length };
}

function positionsOf(company: Company, names: readonly string[]): string[] | string {
  const ids = names.map((name) => company.positions.get(normalized(name)));
  const missing = names.filter((_, index) => ids[index] === undefined);
  if (missing.length > 0) return `no existe el cargo «${missing.join('», «')}»`;
  return ids.filter((id): id is string => id !== undefined);
}

function referencesOf(entry: ListingEntry, company: Company) {
  if (!company.types.has(entry.docType)) return `el tipo ${entry.docType} no está en el catálogo`;
  const processId =
    entry.processCode === null ? null : (company.processes.get(entry.processCode) ?? undefined);
  if (processId === undefined) return `el proceso ${entry.processCode ?? ''} no existe`;
  const folderCode = entry.processCode === null ? 'SGC' : `SGC-${entry.processCode}`;
  const folderId = company.folders.get(folderCode);
  if (folderId === undefined) return `falta la carpeta ${folderCode}`;
  const owner = positionsOf(company, entry.owner === null ? [] : [entry.owner]);
  if (typeof owner === 'string') return owner;
  const targets = positionsOf(company, entry.targets);
  if (typeof targets === 'string') return targets;
  return { processId, folderId, ownerPositionId: owner[0] ?? null, targetPositionIds: targets };
}

/** Las filas que encuentran todo lo suyo, y el problema de las que no. */
export async function prepareEntries(
  tx: TenantTransaction,
  entries: readonly ListingEntry[],
  files: ImportFiles,
): Promise<{ prepared: PreparedEntry[]; problems: RowProblem[] }> {
  const company = await companyOf(tx);
  const prepared: PreparedEntry[] = [];
  const problems: RowProblem[] = [];
  for (const entry of entries) {
    const references = referencesOf(entry, company);
    if (typeof references === 'string') {
      problems.push({ row: entry.row, code: entry.code, problem: references });
      continue;
    }
    const file = await fileOf(entry, files);
    if (typeof file === 'string')
      problems.push({ row: entry.row, code: entry.code, problem: file });
    else prepared.push({ ...entry, ...references, file });
  }
  return { prepared, problems };
}

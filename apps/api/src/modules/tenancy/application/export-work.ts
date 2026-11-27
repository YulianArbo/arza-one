import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import {
  TENANT_EXPORT_TTL_DAYS,
  type ExportManifest,
  type ExportManifestFile,
  type ExportManifestTable,
} from '@arza/contracts';

import {
  claimQueuedExport,
  companyIdentity,
  expireDueExports,
  exportColumns,
  exportRows,
  exportTables,
  exportWorkTenants,
  markExportFailed,
  markExportReady,
  omittedColumns,
  omittedTables,
  type ClaimedExport,
} from '../../core/index.js';
import type { FileStorage } from '../../doc/index.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { csvHeader, csvLine } from '../domain/export-csv.js';
import { ZipWriter } from '../infrastructure/zip-writer.js';

// Generación de la exportación completa (B48, decisiones 4 y 5). El worker la arma dentro del
// contexto de la empresa, así la seguridad por fila garantiza que solo salen sus datos. Cada tabla
// se lee por páginas; los archivos salen del almacenamiento con su huella SHA-256. El ZIP se arma
// en una carpeta temporal y se sube al almacenamiento privado. Las listas vencen a los 7 días.

export interface ExportWorkDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
  readonly storage: Pick<FileStorage, 'list' | 'stream' | 'put' | 'delete'>;
}

export interface ExportWorkResult {
  readonly generated: number;
  readonly failed: number;
  readonly expired: number;
}

const PAGE = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const README = [
  'Exportación completa de la empresa en ARZA ONE.',
  '',
  '- tablas/: una hoja CSV por tabla (UTF-8, separada por punto y coma), para abrir en Excel.',
  '- archivos/: los archivos originales que la empresa subió o generó.',
  '- manifest.json: cuántas filas trae cada tabla, qué columnas y tablas se dejaron fuera y por qué,',
  '  y la huella SHA-256 de cada archivo para comprobar que llegó completo.',
  '',
  'Nunca salen las contraseñas, las llaves del segundo factor, las sesiones ni los códigos de acceso.',
  '',
].join('\r\n');

/**
 * Clave del ZIP en el almacenamiento: fuera de la carpeta de la empresa, para no exportarlo, y
 * propia de cada intento, para que un intento abandonado no pise el archivo de otro.
 */
function exportStorageKey(tenantId: string, job: ClaimedExport): string {
  return `exports/${tenantId}/${job.id}-${String(job.attempt)}.zip`;
}

function system(tenantId: string): { tenantId: string; userId: null } {
  return { tenantId, userId: null };
}

async function auditExport(
  tx: TenantTransaction,
  tenantId: string,
  at: Date,
  entry: { action: string; id: string; changes: Record<string, number | string> },
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId,
    occurredAt: at,
    actor: { kind: 'system' },
    action: entry.action,
    entityType: 'tenant_export',
    entityId: entry.id,
    result: 'success',
    changes: entry.changes,
    meta: null,
  });
}

/** Las filas de una tabla como CSV, página por página; deja en `counted` cuántas salieron. */
async function* tableCsv(
  deps: ExportWorkDependencies,
  tenantId: string,
  table: string,
  counted: { rows: number },
): AsyncGenerator<string> {
  const columns = await deps.database.withTenant(system(tenantId), (tx) =>
    exportColumns(tx, table),
  );
  yield csvHeader(columns);
  for (let offset = 0; ; offset += PAGE) {
    const rows = await deps.database.withTenant(system(tenantId), (tx) =>
      exportRows(tx, table, offset, PAGE),
    );
    counted.rows += rows.length;
    if (rows.length > 0) yield rows.map((row) => csvLine(columns, row)).join('');
    if (rows.length < PAGE) return;
  }
}

async function writeTables(
  deps: ExportWorkDependencies,
  tenantId: string,
  zip: ZipWriter,
): Promise<ExportManifestTable[]> {
  const tables = await deps.database.withTenant(system(tenantId), exportTables);
  const manifest: ExportManifestTable[] = [];
  for (const table of tables) {
    const counted = { rows: 0 };
    await zip.add(`tablas/${table}.csv`, tableCsv(deps, tenantId, table, counted));
    const omitted = await deps.database.withTenant(system(tenantId), (tx) =>
      omittedColumns(tx, table),
    );
    manifest.push({ table, rows: counted.rows, omitted_columns: omitted });
  }
  return manifest;
}

async function writeFiles(
  deps: ExportWorkDependencies,
  tenantId: string,
  zip: ZipWriter,
): Promise<ExportManifestFile[]> {
  const prefix = `${tenantId}/`;
  const files: ExportManifestFile[] = [];
  for (const object of await deps.storage.list(prefix)) {
    const path = `archivos/${object.key.slice(prefix.length)}`;
    const entry = await zip.add(path, await deps.storage.stream(object.key));
    files.push({ path, size_bytes: entry.sizeBytes, sha256: entry.sha256 });
  }
  return files;
}

interface BuiltZip {
  readonly tables: ExportManifestTable[];
  readonly files: ExportManifestFile[];
  readonly manifestText: string;
}

/** Arma el ZIP en la ruta indicada: tablas, archivos, índice y LEAME. */
async function buildZip(
  deps: ExportWorkDependencies,
  tenantId: string,
  at: Date,
  path: string,
): Promise<BuiltZip> {
  const zip = new ZipWriter(createWriteStream(path), at);
  const tables = await writeTables(deps, tenantId, zip);
  const files = await writeFiles(deps, tenantId, zip);
  const { identity, omitted } = await deps.database.withTenant(system(tenantId), async (tx) => ({
    identity: await companyIdentity(tx),
    omitted: await omittedTables(tx),
  }));
  const manifest: ExportManifest = {
    tenant_id: tenantId,
    tax_id: identity.taxId,
    legal_name: identity.legalName,
    generated_at: at.toISOString(),
    tables,
    omitted_tables: omitted,
    files,
  };
  const manifestText = JSON.stringify(manifest, null, 2);
  await zip.add('manifest.json', Readable.from([manifestText]));
  await zip.add('LEAME.txt', Readable.from([README]));
  await zip.finish();
  return { tables, files, manifestText };
}

/** Sube el ZIP y deja la exportación lista, con su auditoría. */
async function publish(
  deps: ExportWorkDependencies,
  tenantId: string,
  job: ClaimedExport,
  built: BuiltZip & { readonly path: string },
): Promise<void> {
  const sizeBytes = (await stat(built.path)).size;
  const storageKey = exportStorageKey(tenantId, job);
  await deps.storage.put(
    { key: storageKey, contentType: 'application/zip', sizeBytes },
    createReadStream(built.path),
  );
  const rows = built.tables.reduce((total, table) => total + table.rows, 0);
  const readyAt = deps.clock.now();
  const ready = {
    storageKey,
    sizeBytes,
    tables: built.tables.length,
    rows,
    files: built.files.length,
    manifestSha256: createHash('sha256').update(built.manifestText).digest('hex'),
    readyAt,
    expiresAt: new Date(readyAt.getTime() + TENANT_EXPORT_TTL_DAYS * DAY_MS),
  };
  const kept = await deps.database.withTenant(system(tenantId), async (tx) => {
    if (!(await markExportReady(tx, job, ready))) return false;
    await auditExport(tx, tenantId, readyAt, {
      action: 'core.tenant.export_ready',
      id: job.id,
      changes: { tables: ready.tables, rows, files: ready.files, size_bytes: sizeBytes },
    });
    return true;
  });
  // Otra pasada retomó la exportación: este archivo sobra.
  if (!kept) await deps.storage.delete(storageKey);
}

async function generate(
  deps: ExportWorkDependencies,
  tenantId: string,
  job: ClaimedExport,
): Promise<void> {
  const folder = await mkdtemp(join(tmpdir(), 'arza-export-'));
  try {
    const path = join(folder, 'exportacion.zip');
    const built = await buildZip(deps, tenantId, deps.clock.now(), path);
    await publish(deps, tenantId, job, { ...built, path });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function fail(
  deps: ExportWorkDependencies,
  tenantId: string,
  job: ClaimedExport,
): Promise<void> {
  await deps.database.withTenant(system(tenantId), async (tx) => {
    if (!(await markExportFailed(tx, job))) return;
    await auditExport(tx, tenantId, deps.clock.now(), {
      action: 'core.tenant.export_fail',
      id: job.id,
      changes: {},
    });
  });
}

/** Borra los ZIP vencidos de la empresa y los marca como vencidos. */
async function expire(deps: ExportWorkDependencies, tenantId: string): Promise<number> {
  const at = deps.clock.now();
  const due = await deps.database.withTenant(system(tenantId), async (tx) => {
    const expired = await expireDueExports(tx, at);
    for (const entry of expired) {
      await auditExport(tx, tenantId, at, {
        action: 'core.tenant.export_expire',
        id: entry.id,
        changes: {},
      });
    }
    return expired;
  });
  for (const entry of due) {
    if (entry.storageKey !== null) await deps.storage.delete(entry.storageKey);
  }
  return due.length;
}

async function claim(
  deps: ExportWorkDependencies,
  tenantId: string,
): Promise<ClaimedExport | null> {
  return deps.database.withTenant(system(tenantId), async (tx) => {
    const job = await claimQueuedExport(tx, deps.clock.now());
    if (job !== null) {
      await auditExport(tx, tenantId, deps.clock.now(), {
        action: 'core.tenant.export_start',
        id: job.id,
        changes: { attempt: job.attempt },
      });
    }
    return job;
  });
}

/** Una pasada: genera las exportaciones en cola y vence las listas antiguas. */
export async function runTenantExportWork(deps: ExportWorkDependencies): Promise<ExportWorkResult> {
  const tenants = await deps.database.withoutTenant((tx) =>
    exportWorkTenants(tx, deps.clock.now()),
  );
  const result = { generated: 0, failed: 0, expired: 0 };
  const errors: unknown[] = [];
  for (const tenantId of tenants) {
    result.expired += await expire(deps, tenantId);
    const job = await claim(deps, tenantId);
    if (job === null) continue;
    try {
      await generate(deps, tenantId, job);
      result.generated += 1;
    } catch (error) {
      // La Dirección ve «fallida» y puede pedirla de nuevo; las demás empresas siguen su turno.
      await fail(deps, tenantId, job);
      result.failed += 1;
      errors.push(error);
    }
  }
  // El worker registra el detalle técnico del primer error (B44); nada se pierde en silencio.
  if (errors.length > 0) {
    throw new AggregateError(errors, `Fallaron ${String(errors.length)} exportaciones.`);
  }
  return result;
}

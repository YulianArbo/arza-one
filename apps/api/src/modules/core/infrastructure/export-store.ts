import type { TenantExport as TenantExportRow } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Exportación completa de la empresa (B48). La lista de tablas y lo que se deja fuera salen de la
// base de datos (core_export_tables, core_export_omissions); así una tabla nueva entra sola.

export type { TenantExportRow };

/** Tablas con tenant_id que se exportan, en orden alfabético. */
export async function exportTables(tx: TenantTransaction): Promise<string[]> {
  const rows = await tx.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM core_export_tables()`;
  return rows.map((row) => row.table_name);
}

export interface OmittedTable {
  readonly table: string;
  readonly reason: string;
}

export async function omittedTables(tx: TenantTransaction): Promise<OmittedTable[]> {
  const rows = await tx.$queryRaw<{ table_name: string; reason: string }[]>`
    SELECT table_name, reason FROM core_export_omissions() ORDER BY table_name`;
  return rows.map((row) => ({ table: row.table_name, reason: row.reason }));
}

export async function omittedColumns(tx: TenantTransaction, table: string): Promise<string[]> {
  const rows = await tx.$queryRaw<{ columns: string[] }[]>`
    SELECT core_export_omitted_columns(${table}) AS columns`;
  return rows[0]?.columns ?? [];
}

/** Columnas que salen de la tabla, en su orden; sin las que nunca se exportan. */
export async function exportColumns(tx: TenantTransaction, table: string): Promise<string[]> {
  const rows = await tx.$queryRaw<{ name: string }[]>`
    SELECT a.attname::text AS name
    FROM pg_attribute a
    WHERE a.attrelid = to_regclass(format('public.%I', ${table}::text)) AND a.attnum > 0
      AND NOT a.attisdropped AND NOT core_export_omits_column(a.attname)
    ORDER BY a.attnum`;
  return rows.map((row) => row.name);
}

/** Una página de filas de la tabla, de la empresa del contexto. */
export async function exportRows(
  tx: TenantTransaction,
  table: string,
  offset: number,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const rows = await tx.$queryRaw<{ row: Record<string, unknown> }[]>`
    SELECT core_export_rows(${table}, ${offset}::bigint, ${limit}::integer) AS row`;
  return rows.map((entry) => entry.row);
}

/** Empresas con exportaciones por generar o por vencer. Sin contexto de empresa. */
export async function exportWorkTenants(tx: TenantTransaction, at: Date): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT core_export_work_tenants(${at}) AS id`;
  return rows.map((row) => row.id);
}

export async function listTenantExports(tx: TenantTransaction): Promise<TenantExportRow[]> {
  return tx.tenantExport.findMany({ orderBy: { requestedAt: 'desc' }, take: 20 });
}

export async function findTenantExport(
  tx: TenantTransaction,
  id: string,
): Promise<TenantExportRow | null> {
  return tx.tenantExport.findFirst({ where: { id } });
}

export async function exportInProgress(tx: TenantTransaction): Promise<boolean> {
  return (await tx.tenantExport.count({ where: { status: { in: ['queued', 'running'] } } })) > 0;
}

export async function queueTenantExport(
  tx: TenantTransaction,
  input: { readonly tenantId: string; readonly requestedBy: string; readonly at: Date },
): Promise<string> {
  const created = await tx.tenantExport.create({
    data: { tenantId: input.tenantId, requestedBy: input.requestedBy, requestedAt: input.at },
  });
  return created.id;
}

/** La siguiente exportación en cola (o una que quedó a medias), marcada como en curso. */
export async function claimQueuedExport(
  tx: TenantTransaction,
  at: Date,
): Promise<TenantExportRow | null> {
  const next = await tx.tenantExport.findFirst({
    where: { status: { in: ['queued', 'running'] } },
    orderBy: { requestedAt: 'asc' },
  });
  if (next === null) return null;
  return tx.tenantExport.update({
    where: { id: next.id },
    data: { status: 'running', startedAt: at, attempts: { increment: 1 } },
  });
}

export interface ReadyExport {
  readonly storageKey: string;
  readonly sizeBytes: number;
  readonly tables: number;
  readonly rows: number;
  readonly files: number;
  readonly manifestSha256: string;
  readonly readyAt: Date;
  readonly expiresAt: Date;
}

export async function markExportReady(
  tx: TenantTransaction,
  id: string,
  ready: ReadyExport,
): Promise<void> {
  await tx.tenantExport.update({
    where: { id },
    data: {
      status: 'ready',
      storageKey: ready.storageKey,
      sizeBytes: BigInt(ready.sizeBytes),
      tablesCount: ready.tables,
      rowsCount: BigInt(ready.rows),
      filesCount: ready.files,
      manifestSha256: ready.manifestSha256,
      readyAt: ready.readyAt,
      expiresAt: ready.expiresAt,
    },
  });
}

export async function markExportFailed(tx: TenantTransaction, id: string): Promise<void> {
  await tx.tenantExport.update({ where: { id }, data: { status: 'failed' } });
}

/** Exportaciones listas cuyo plazo venció: pasan a vencidas y se devuelve su archivo. */
export async function expireDueExports(
  tx: TenantTransaction,
  at: Date,
): Promise<{ id: string; storageKey: string | null }[]> {
  const due = await tx.tenantExport.findMany({
    where: { status: 'ready', expiresAt: { lte: at } },
    select: { id: true, storageKey: true },
  });
  if (due.length > 0) {
    await tx.tenantExport.updateMany({
      where: { id: { in: due.map((entry) => entry.id) } },
      data: { status: 'expired' },
    });
  }
  return due;
}

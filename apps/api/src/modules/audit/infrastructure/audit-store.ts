import type {
  AuditExportListQuery,
  AuditFilter,
  ChainProblem,
  SecurityEventListQuery,
} from '@arza/contracts';

import type {
  AuditEvent,
  AuditExport,
  Prisma,
  SecurityEvent,
} from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Lecturas de la auditoría (B11), siempre dentro de la transacción de la empresa: la seguridad por
// fila no deja ver eventos de otra.

export interface Page<T> {
  readonly rows: T[];
  readonly nextCursor: string | null;
}

interface PageRequest {
  readonly limit: number;
  readonly cursor?: string | undefined;
}

function period(from?: string, to?: string): { occurredAt?: Prisma.DateTimeFilter } {
  if (from === undefined && to === undefined) return {};
  return {
    occurredAt: {
      ...(from === undefined ? {} : { gte: new Date(from) }),
      ...(to === undefined ? {} : { lt: new Date(to) }),
    },
  };
}

/** «iam.role» trae iam.role e iam.role.*, nunca iam.roles. */
function actionFilter(action: string): Prisma.AuditEventWhereInput {
  return { OR: [{ action }, { action: { startsWith: `${action}.` } }] };
}

export function auditWhere(filter: AuditFilter): Prisma.AuditEventWhereInput {
  return {
    ...period(filter.from, filter.to),
    ...(filter.actor_id === undefined ? {} : { actorId: filter.actor_id }),
    ...(filter.entity_type === undefined ? {} : { entityType: filter.entity_type }),
    ...(filter.entity_id === undefined ? {} : { entityId: filter.entity_id }),
    ...(filter.result === undefined ? {} : { result: filter.result }),
    ...(filter.action === undefined ? {} : actionFilter(filter.action)),
  };
}

function pageOf<T>(rows: T[], limit: number, cursorOf: (row: T) => string): Page<T> {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const more = rows.length > limit && last !== undefined;
  return { rows: page, nextCursor: more ? cursorOf(last) : null };
}

/** Eventos del más reciente al más antiguo, por su lugar en la cadena. */
export async function listAuditEvents(
  tx: TenantTransaction,
  where: Prisma.AuditEventWhereInput,
  page: PageRequest,
): Promise<Page<AuditEvent>> {
  const before = page.cursor === undefined ? {} : { seq: { lt: BigInt(page.cursor) } };
  const rows = await tx.auditEvent.findMany({
    where: { AND: [where, before] },
    orderBy: [{ seq: 'desc' }],
    take: page.limit + 1,
  });
  return pageOf(rows, page.limit, (row) => row.seq.toString());
}

/** Eventos para exportar, en el orden de la cadena; uno de más avisa que se pasó del máximo. */
export async function auditEventsForExport(
  tx: TenantTransaction,
  where: Prisma.AuditEventWhereInput,
  max: number,
): Promise<AuditEvent[]> {
  return tx.auditEvent.findMany({ where, orderBy: [{ seq: 'asc' }], take: max + 1 });
}

export async function listSecurityEvents(
  tx: TenantTransaction,
  query: SecurityEventListQuery,
): Promise<Page<SecurityEvent>> {
  const rows = await tx.securityEvent.findMany({
    where: {
      ...period(query.from, query.to),
      ...(query.severity === undefined ? {} : { severity: query.severity }),
      ...(query.user_id === undefined ? {} : { userId: query.user_id }),
    },
    orderBy: [{ id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
  });
  return pageOf(rows, query.limit, (row) => row.id);
}

export async function listExports(
  tx: TenantTransaction,
  query: AuditExportListQuery,
): Promise<Page<AuditExport>> {
  const rows = await tx.auditExport.findMany({
    orderBy: [{ id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
  });
  return pageOf(rows, query.limit, (row) => row.id);
}

export interface ChainCheck {
  readonly checked: number;
  readonly brokenSeq: number | null;
  readonly problem: ChainProblem | null;
}

const PROBLEMS: readonly ChainProblem[] = ['missing', 'altered', 'broken_link', 'truncated'];

/** Recalcula la cadena de la empresa del contexto con aud_verify_chain (migración de B11). */
export async function verifyChain(tx: TenantTransaction): Promise<ChainCheck> {
  const [row] = await tx.$queryRaw<
    { checked: bigint; broken_seq: bigint | null; problem: string | null }[]
  >`SELECT checked, broken_seq, problem FROM aud_verify_chain()`;
  return {
    checked: Number(row?.checked ?? 0),
    brokenSeq: row?.broken_seq === null || row === undefined ? null : Number(row.broken_seq),
    problem: PROBLEMS.find((problem) => problem === row?.problem) ?? null,
  };
}

/** Crea las particiones de los meses que faltan, desde este mes hasta tres más adelante. */
export async function ensurePartitions(tx: TenantTransaction, now: Date): Promise<number> {
  const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 1));
  const [row] = await tx.$queryRaw<{ created: number }[]>`
    SELECT aud_ensure_partitions(${now}::date, ${until}::date) AS created`;
  return row?.created ?? 0;
}

/** Todas las empresas, para la verificación diaria (aud_tenant_ids, migración de B11). */
export async function tenantIds(tx: TenantTransaction): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT aud_tenant_ids() AS id`;
  return rows.map((row) => row.id);
}

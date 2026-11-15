import type { Prisma } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { costCenterRefs, isActiveCatalogCode, toCalendarDate } from '../../core/index.js';
import { isAttachableFile } from '../../doc/index.js';
import { periodOf } from '../domain/ledger-rules.js';
import type { InvoiceActor } from './invoice-actor.js';
import { periodClosed, recordInvalid, supportFileInvalid } from './ledger-messages.js';

// Piezas comunes del B32: la persona que actúa, el registro de auditoría con su evento de salida,
// la guarda de periodo cerrado y la validación de centro de costo, rubro y soporte.

export type FinActor = InvoiceActor;

export const CATEGORY_CATALOG = 'fin_expense_categories';

export interface FinEvent {
  readonly action: string;
  readonly event: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly payload: Prisma.InputJsonObject;
  readonly changes: Prisma.InputJsonObject;
}

/** Auditoría y bandeja de salida en la misma transacción que la escritura. */
export async function recordFinEvent(
  tx: TenantTransaction,
  actor: FinActor,
  at: Date,
  event: FinEvent,
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: actor.principal.tenantId,
    occurredAt: at,
    actor: { kind: 'user', id: actor.principal.userId },
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    result: 'success',
    changes: event.changes,
    meta: actor.meta,
  });
  await addOutboxEvent(tx, {
    tenantId: actor.principal.tenantId,
    eventType: event.event,
    actorId: actor.principal.userId,
    occurredAt: at,
    payload: { id: event.entityId, ...event.payload },
  });
}

/**
 * El cierre de un mes y las escrituras con fecha en ese mes se serializan con un candado de
 * transacción por empresa y mes: el cierre lo toma exclusivo y las escrituras compartido. Así una
 * escritura no se cuela mientras el cierre arma su archivo.
 */
async function lockPeriod(
  tx: TenantTransaction,
  period: string,
  exclusive: boolean,
): Promise<void> {
  const key = `fin.period:${period}`;
  await (exclusive
    ? tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(core_current_tenant_id()::text || ${key}, 0))`
    : tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(core_current_tenant_id()::text || ${key}, 0))`);
}

export async function isPeriodClosed(tx: TenantTransaction, period: string): Promise<boolean> {
  const closed = await tx.finPeriod.count({ where: { period, deletedAt: null } });
  return closed > 0;
}

/** Rechaza la escritura si la fecha (AAAA-MM-DD, Date o mes) cae en un mes cerrado. */
export async function assertPeriodOpen(tx: TenantTransaction, when: string | Date): Promise<void> {
  const period = periodOf(typeof when === 'string' ? when : toCalendarDate(when));
  await lockPeriod(tx, period, false);
  if (await isPeriodClosed(tx, period)) throw periodClosed(period);
}

/** Toma el candado exclusivo del mes para cerrarlo. */
export async function lockPeriodForClose(tx: TenantTransaction, period: string): Promise<void> {
  await lockPeriod(tx, period, true);
}

export async function assertActiveCostCenter(tx: TenantTransaction, id: string): Promise<void> {
  const center = (await costCenterRefs(tx, [id])).get(id);
  if (center?.isActive !== true) {
    throw recordInvalid('Elija un centro de costo activo.');
  }
}

export async function assertActiveCategory(tx: TenantTransaction, code: string): Promise<void> {
  if (!(await isActiveCatalogCode(tx, CATEGORY_CATALOG, code))) {
    throw recordInvalid('Elija un rubro activo del catálogo.');
  }
}

export async function assertSupportFile(
  tx: TenantTransaction,
  actor: FinActor,
  fileId: string,
): Promise<void> {
  if (!(await isAttachableFile(tx, actor.principal, fileId))) throw supportFileInvalid();
}

/** Fecha AAAA-MM-DD como la guarda una columna date. */
export function dateColumn(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Centro de costo para mostrar; si ya no existe, un nombre genérico. */
export function centerRef(
  centers: ReadonlyMap<string, { readonly code: string; readonly name: string }>,
  id: string,
): { id: string; code: string; name: string } {
  const center = centers.get(id);
  return { id, code: center?.code ?? '—', name: center?.name ?? 'Centro de costo' };
}

import type { PurchaseTiers } from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { costCenterRefs, purchaseTiersOn } from '../../core/index.js';
import { isAttachableFile } from '../../doc/index.js';
import type { peopleById } from '../../iam/index.js';
import { recordInvalid, supportFileInvalid, tiersMissing } from './purchase-messages.js';

// Piezas comunes de Compras (B33): la persona que actúa, el registro de auditoría con su evento de
// salida y las validaciones de centro de costo, archivo y topes vigentes.

export interface PurActor {
  readonly principal: Principal;
  readonly meta: RequestMeta;
}

export interface PurEvent {
  readonly action: string;
  readonly event: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly payload: Prisma.InputJsonObject;
  readonly changes: Prisma.InputJsonObject;
}

/** Auditoría y bandeja de salida en la misma transacción que la escritura. */
export async function recordPurEvent(
  tx: TenantTransaction,
  actor: PurActor,
  at: Date,
  event: PurEvent,
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

export async function assertActiveCostCenter(tx: TenantTransaction, id: string): Promise<void> {
  const center = (await costCenterRefs(tx, [id])).get(id);
  if (center?.isActive !== true) throw recordInvalid('Elija un centro de costo activo.');
}

export async function assertOwnFile(
  tx: TenantTransaction,
  actor: PurActor,
  fileId: string,
): Promise<void> {
  if (!(await isAttachableFile(tx, actor.principal, fileId))) throw supportFileInvalid();
}

/** Topes vigentes ese día; sin ellos no hay cómo saber quién aprueba ni cuántas cotizaciones. */
export async function requireTiers(tx: TenantTransaction, today: string): Promise<PurchaseTiers> {
  const tiers = await purchaseTiersOn(tx, today);
  if (tiers === null) throw tiersMissing();
  return tiers;
}

/** Fecha AAAA-MM-DD como la guarda una columna date. */
export function dateColumn(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export type PersonRefs = Awaited<ReturnType<typeof peopleById>>;

/** Nombre visible de una persona; si ya no existe, un nombre genérico. */
export function personRef(people: PersonRefs, id: string): { id: string; name: string } {
  const person = people.get(id);
  return { id, name: person?.displayName ?? person?.email ?? 'Persona' };
}

/** Centro de costo para mostrar; si ya no existe, un nombre genérico. */
export function centerRef(
  centers: ReadonlyMap<string, { readonly code: string; readonly name: string }>,
  id: string,
): { id: string; code: string; name: string } {
  const center = centers.get(id);
  return { id, code: center?.code ?? '—', name: center?.name ?? 'Centro de costo' };
}

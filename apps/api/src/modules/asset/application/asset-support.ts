import type { AstAsset, Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { recordNotFound } from './asset-messages.js';

// Piezas comunes de Activos (B34): quién actúa, el registro de auditoría con su evento de salida
// (ADR-012) y los cambios del activo con control de versión.

/** Quién actúa: una persona con sesión o el sistema (el worker que sigue la firma). */
export interface AstActor {
  readonly tenantId: string;
  readonly userId: string | null;
  readonly meta: RequestMeta | null;
  readonly at: Date;
}

export function astActorOf(principal: Principal, meta: RequestMeta, at: Date): AstActor {
  return { tenantId: principal.tenantId, userId: principal.userId, meta, at };
}

type AstEntity = 'ast_asset' | 'ast_assignment' | 'ast_maintenance';

export interface AstEvent {
  /** Acción de la auditoría, como «asset.assignment.create». */
  readonly action: string;
  /** Evento de la bandeja de salida: solo letras y puntos, como «ast.assignment.created». */
  readonly event: string;
  readonly entityType: AstEntity;
  readonly entityId: string;
  /** Identificadores y códigos, nunca datos personales. */
  readonly payload: Prisma.InputJsonObject;
  readonly changes: Prisma.InputJsonObject;
}

/** Auditoría y bandeja de salida en la misma transacción que la escritura. */
export async function recordAstEvent(
  tx: TenantTransaction,
  actor: AstActor,
  event: AstEvent,
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: actor.userId === null ? { kind: 'system' } : { kind: 'user', id: actor.userId },
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    result: 'success',
    changes: event.changes,
    meta: actor.meta,
  });
  await addOutboxEvent(tx, {
    tenantId: actor.tenantId,
    eventType: event.event,
    actorId: actor.userId,
    occurredAt: actor.at,
    payload: { id: event.entityId, ...event.payload },
  });
}

/** Fecha AAAA-MM-DD como la guarda una columna date. */
export function dateColumn(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export async function findAsset(tx: TenantTransaction, id: string): Promise<AstAsset> {
  const asset = await tx.astAsset.findFirst({ where: { id, deletedAt: null } });
  if (asset === null) throw recordNotFound('ese activo');
  return asset;
}

/** Cambia el activo solo si sigue en el estado (y, si se indica, la versión) que se vio. */
export async function changeAsset(
  tx: TenantTransaction,
  seen: { readonly id: string; readonly status: string; readonly version?: number },
  data: Prisma.AstAssetUncheckedUpdateManyInput,
): Promise<void> {
  const { count } = await tx.astAsset.updateMany({ where: { ...seen, deletedAt: null }, data });
  if (count === 0) throw versionConflict();
}

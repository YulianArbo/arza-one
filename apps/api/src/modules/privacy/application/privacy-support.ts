import type { Prisma } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import type { PartyDirectory } from './party-directory.js';

// Piezas comunes de los casos de uso de privacidad (B17).

/** Quién escribe: una persona con sesión, o el sistema (la semilla). */
export interface PrivacyActor {
  readonly tenantId: string;
  /** null cuando actúa el sistema. */
  readonly userId: string | null;
  /** La sesión de quien actúa; null para el sistema. */
  readonly principal: Principal | null;
  readonly meta: RequestMeta | null;
  readonly at: Date;
}

export function actorOf(principal: Principal, meta: RequestMeta, at: Date): PrivacyActor {
  return { tenantId: principal.tenantId, userId: principal.userId, principal, meta, at };
}

export interface PrivacyChange {
  readonly action: string;
  readonly entityType:
    | 'prv_notice'
    | 'prv_consent'
    | 'prv_processing_activity'
    | 'prv_processor'
    | 'prv_cookie_consent';
  readonly entityId: string;
  readonly changes: Prisma.InputJsonObject;
}

/** Evento de auditoría de cada escritura, en la misma transacción (ADR-012). */
export async function auditPrivacy(
  tx: TenantTransaction,
  actor: PrivacyActor,
  change: PrivacyChange,
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: actor.userId === null ? { kind: 'system' } : { kind: 'user', id: actor.userId },
    action: change.action,
    entityType: change.entityType,
    entityId: change.entityId,
    result: 'success',
    changes: change.changes,
    meta: actor.meta,
  });
}

/** Nombres de los terceros para mostrar; null si ya no existe. */
export async function partyNames(
  tx: TenantTransaction,
  parties: PartyDirectory,
  ids: readonly string[],
): Promise<(id: string) => string | null> {
  const found = await parties.describe(tx, [...new Set(ids)]);
  return (id) => found.get(id)?.name ?? null;
}

/**
 * Bloqueo por clave dentro de la transacción: dos personas que publican o crean versiones del
 * mismo texto a la vez se turnan. No escribe nada, así que no cuenta como escritura.
 */
export async function lockKey(tx: TenantTransaction, tenantId: string, key: string): Promise<void> {
  const name = `prv:${tenantId}:${key}`;
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${name}, 0))) AS taken`;
}

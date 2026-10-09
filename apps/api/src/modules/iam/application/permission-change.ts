import type { Prisma } from '../../../generated/prisma/client.js';
import { recordAuditEvent, recordSecurityEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';

/** Sin petición web: el comando no tiene dirección IP ni navegador. */
export const COMMAND_META: RequestMeta = { ip: null, userAgent: null, correlationId: null };

export interface PermissionChange {
  readonly tenantId: string;
  /** Quien hace el cambio; null si es el sistema (comandos, semilla). */
  readonly actorId: string | null;
  /** Por ejemplo «iam.role.assign»; también es el tipo del evento de seguridad. */
  readonly action: string;
  readonly entityType: 'iam_user' | 'iam_role' | 'iam_delegation';
  readonly entityId: string;
  readonly changes: Prisma.InputJsonObject;
  readonly occurredAt: Date;
  readonly meta: RequestMeta | null;
}

/**
 * Todo cambio de permisos deja, en la misma transacción, su registro de auditoría, un evento de
 * seguridad y una alerta en la bandeja de salida (numeral 15.5: «alerta de cada cambio de
 * permisos»). B16 la hace llegar al responsable técnico.
 */
export async function recordPermissionChange(
  tx: TenantTransaction,
  change: PermissionChange,
): Promise<void> {
  const actor = change.actorId === null ? { kind: 'system' as const } : userActor(change.actorId);
  const meta = change.meta ?? COMMAND_META;
  await recordAuditEvent(tx, {
    tenantId: change.tenantId,
    occurredAt: change.occurredAt,
    actor,
    action: change.action,
    entityType: change.entityType,
    entityId: change.entityId,
    result: 'success',
    changes: change.changes,
    meta,
  });
  const detail = { ...change.changes, entity_id: change.entityId, actor_id: change.actorId };
  await recordSecurityEvent(tx, {
    tenantId: change.tenantId,
    occurredAt: change.occurredAt,
    type: 'iam.permissions.changed',
    userId: change.actorId,
    severity: 'medium',
    detail: { ...detail, action: change.action },
    meta,
  });
  await addOutboxEvent(tx, {
    tenantId: change.tenantId,
    eventType: 'security.alert',
    actorId: change.actorId,
    occurredAt: change.occurredAt,
    payload: { type: 'iam.permissions.changed', action: change.action, ...detail },
  });
}

function userActor(id: string): { readonly kind: 'user'; readonly id: string } {
  return { kind: 'user', id };
}

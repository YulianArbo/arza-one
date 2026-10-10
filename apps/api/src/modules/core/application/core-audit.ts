import type { Prisma } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type {
  TenantContext,
  TenantTransaction,
} from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';

// Evento de auditoría de cada escritura del núcleo, en la misma transacción (ADR-012). Las
// acciones siguen los permisos del anexo G: «core.site.create», «core.parameter.update».

/** Quién escribe, desde dónde y cuándo: una persona con sesión o el sistema (semilla). */
export interface CoreActor {
  readonly context: TenantContext;
  readonly meta: RequestMeta | null;
  readonly at: Date;
}

export interface CoreChange {
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly changes: Prisma.InputJsonObject;
}

export async function auditCore(
  tx: TenantTransaction,
  actor: CoreActor,
  change: CoreChange,
): Promise<void> {
  const { userId, tenantId } = actor.context;
  await recordAuditEvent(tx, {
    tenantId,
    occurredAt: actor.at,
    actor: userId === null ? { kind: 'system' } : { kind: 'user', id: userId },
    action: change.action,
    entityType: change.entityType,
    entityId: change.entityId,
    result: 'success',
    changes: change.changes,
    meta: actor.meta,
  });
}

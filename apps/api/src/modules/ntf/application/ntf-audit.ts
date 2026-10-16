import type { Prisma } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';

/** Quién actúa en los avisos, comentarios y adjuntos: una persona con sesión, o el sistema. */
export interface NtfActor {
  readonly tenantId: string;
  /** null cuando actúa el sistema (la semilla). */
  readonly userId: string | null;
  readonly meta: RequestMeta | null;
  readonly at: Date;
}

export interface NtfChange {
  readonly action: string;
  readonly entityType:
    'ntf_template' | 'ntf_notification' | 'ntf_preference' | 'core_comment' | 'core_attachment';
  readonly entityId: string | null;
  readonly changes: Prisma.InputJsonObject;
}

export async function auditNtf(
  tx: TenantTransaction,
  actor: NtfActor,
  change: NtfChange,
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

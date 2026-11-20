import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { revokeAllSessions } from '../infrastructure/accounts-store.js';

// Retiro del colaborador (numeral 15.1 «Retiro», B36 decisión 9): terminado el último día laborado,
// la cuenta queda inactiva y se cierran todas sus sesiones. Lo pide Talento humano por este índice;
// el trabajo diario lo hace solo, sin persona que actúe.

export interface AccessRevocation {
  readonly tenantId: string;
  readonly userId: string;
  /** Quien registró el retiro, o null si lo hace el trabajo diario. */
  readonly actorId: string | null;
  readonly at: Date;
}

/** Desactiva la cuenta y cierra sus sesiones; devuelve cuántas sesiones cerró. */
export async function revokeEmployeeAccess(
  tx: TenantTransaction,
  revocation: AccessRevocation,
): Promise<number> {
  const user = await tx.user.findFirst({
    where: { id: revocation.userId, kind: 'internal', deletedAt: null },
    select: { id: true, status: true },
  });
  if (user === null) return 0;
  if (user.status !== 'inactive') {
    await tx.user.update({ where: { id: user.id }, data: { status: 'inactive' } });
  }
  const closed = await revokeAllSessions(tx, user.id, 'offboarding', revocation.at);
  await recordAuditEvent(tx, {
    tenantId: revocation.tenantId,
    occurredAt: revocation.at,
    actor:
      revocation.actorId === null ? { kind: 'system' } : { kind: 'user', id: revocation.actorId },
    action: 'iam.user.offboard',
    entityType: 'iam_user',
    entityId: user.id,
    result: 'success',
    changes: { status: { from: user.status, to: 'inactive' }, sessions_closed: closed },
    meta: null,
  });
  await addOutboxEvent(tx, {
    tenantId: revocation.tenantId,
    actorId: revocation.actorId,
    occurredAt: revocation.at,
    eventType: 'iam.user.deactivated',
    payload: { id: user.id, reason: 'offboarding' },
  });
  return closed;
}

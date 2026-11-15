import type { Prisma, FinInvoice } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import type { InvoiceActor } from './invoice-actor.js';

export async function recordInvoiceEvent(
  tx: TenantTransaction,
  actor: InvoiceActor,
  at: Date,
  event: {
    readonly action: string;
    readonly event: string;
    readonly invoice: FinInvoice;
    readonly changes: Prisma.InputJsonObject;
  },
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: actor.principal.tenantId,
    occurredAt: at,
    actor: { kind: 'user', id: actor.principal.userId },
    action: event.action,
    entityType: 'fin_invoice',
    entityId: event.invoice.id,
    result: 'success',
    changes: event.changes,
    meta: actor.meta,
  });
  await addOutboxEvent(tx, {
    tenantId: actor.principal.tenantId,
    eventType: event.event,
    actorId: actor.principal.userId,
    occurredAt: at,
    payload: { id: event.invoice.id, code: event.invoice.code },
  });
}

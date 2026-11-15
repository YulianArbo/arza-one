import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { billableMilestone, type BillableMilestone } from '../../project/index.js';
import { nextBusinessCode } from '../../core/index.js';
import { milestoneNotBillable } from './invoice-messages.js';
import type { InvoiceActor } from './invoice-actor.js';
import { recordInvoiceEvent } from './invoice-events.js';

const INVOICE_SEQUENCE = 'fin.invoice';

export async function requestInvoice(
  tx: TenantTransaction,
  actor: InvoiceActor,
  milestoneId: string,
  key: string,
  at: Date,
): Promise<string> {
  const byKey = await tx.finInvoice.findFirst({ where: { requestKey: key, deletedAt: null } });
  if (byKey !== null) return byKey.milestoneId === milestoneId ? byKey.id : reuseKey();
  const milestone = await billableMilestone(tx, milestoneId);
  if (milestone === null || (await hasOpenInvoice(tx, milestoneId))) throw milestoneNotBillable();
  const code = await nextBusinessCode(tx, INVOICE_SEQUENCE, at, {
    name: 'Facturas',
    prefix: 'FAC',
    padding: 4,
  });
  const invoice = await tx.finInvoice.create({
    data: {
      tenantId: actor.principal.tenantId,
      code,
      partyId: milestone.partyId,
      contractId: milestone.contractId,
      milestoneId,
      requestedAmount: milestone.amount,
      requestKey: key,
      createdBy: actor.principal.userId,
    },
  });
  await createInvoiceItem(tx, actor, invoice.id, milestone);
  await recordInvoiceEvent(tx, actor, at, {
    action: 'finance.invoice.request',
    event: 'fin.invoice.requested',
    invoice,
    changes: { milestone_id: milestoneId, requested_amount: milestone.amount },
  });
  return invoice.id;
}

/** Una solicitud anulada libera el hito; solo lo ocupa una factura vigente. */
async function hasOpenInvoice(tx: TenantTransaction, milestoneId: string): Promise<boolean> {
  const open = await tx.finInvoice.findFirst({
    where: { milestoneId, status: { not: 'voided' }, deletedAt: null },
    select: { id: true },
  });
  return open !== null;
}

function reuseKey(): never {
  throw idempotencyKeyReused();
}

async function createInvoiceItem(
  tx: TenantTransaction,
  actor: InvoiceActor,
  invoiceId: string,
  milestone: BillableMilestone,
): Promise<void> {
  await tx.finInvoiceItem.create({
    data: {
      tenantId: actor.principal.tenantId,
      invoiceId,
      position: 1,
      description: `${milestone.projectCode} · ${milestone.name}`,
      quantity: '1.00',
      unitPrice: milestone.amount,
      lineTotal: milestone.amount,
      createdBy: actor.principal.userId,
    },
  });
}

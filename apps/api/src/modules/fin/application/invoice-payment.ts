import { Decimal } from 'decimal.js';
import type { CreatePayment } from '@arza/contracts';

import type { FinInvoice } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { isAttachableFile } from '../../doc/index.js';
import {
  fiscalFileInvalid,
  invoiceNotFound,
  invoiceStatusInvalid,
  paymentInvalid,
} from './invoice-messages.js';
import type { InvoiceActor } from './invoice-actor.js';

const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export async function createPayment(
  tx: TenantTransaction,
  actor: InvoiceActor,
  id: string,
  key: string,
  input: CreatePayment,
  at: Date,
): Promise<string> {
  const prior = await tx.finPayment.findFirst({ where: { requestKey: key, deletedAt: null } });
  if (prior !== null)
    return prior.invoiceId === id && prior.amount.toFixed(2) === input.amount
      ? prior.id
      : reuseKey();
  const invoice = await loadPaymentTarget(tx, id);
  await validatePaymentFile(tx, actor, input.support_file_id);
  const totals = await settlementTotals(tx, id);
  validatePaymentAmount(invoice, totals.paid, totals.credited, input.amount);
  const payment = await tx.finPayment.create({
    data: {
      tenantId: actor.principal.tenantId,
      invoiceId: id,
      paidOn: new Date(`${input.paid_on}T00:00:00.000Z`),
      amount: input.amount,
      method: input.method,
      reference: input.reference,
      supportFileId: input.support_file_id,
      requestKey: key,
      createdBy: actor.principal.userId,
    },
  });
  await updatePaymentStatus(tx, invoice, totals, input.amount);
  await auditPayment(tx, actor, payment.id, id, input, at);
  return payment.id;
}

function reuseKey(): never {
  throw idempotencyKeyReused();
}

async function loadPaymentTarget(
  tx: TenantTransaction,
  id: string,
): Promise<FinInvoice & { readonly total: Decimal }> {
  const invoice = await tx.finInvoice.findFirst({ where: { id, deletedAt: null } });
  if (invoice === null) throw invoiceNotFound();
  if (!['issued', 'partially_paid'].includes(invoice.status) || invoice.total === null) {
    throw invoiceStatusInvalid('El recaudo requiere una factura emitida con saldo pendiente.');
  }
  const total = invoice.total;
  return { ...invoice, total };
}

async function validatePaymentFile(
  tx: TenantTransaction,
  actor: InvoiceActor,
  fileId: string | null,
): Promise<void> {
  if (fileId !== null && !(await isAttachableFile(tx, actor.principal, fileId))) {
    throw fiscalFileInvalid();
  }
}

async function settlementTotals(
  tx: TenantTransaction,
  id: string,
): Promise<{ readonly paid: Decimal; readonly credited: Decimal }> {
  const [payments, notes] = await Promise.all([
    tx.finPayment.findMany({ where: { invoiceId: id, deletedAt: null }, select: { amount: true } }),
    tx.finCreditNote.findMany({
      where: { invoiceId: id, deletedAt: null },
      select: { amount: true },
    }),
  ]);
  return {
    paid: payments.reduce((sum, row) => sum.plus(row.amount.toString()), new Money(0)),
    credited: notes.reduce((sum, row) => sum.plus(row.amount.toString()), new Money(0)),
  };
}

function validatePaymentAmount(
  invoice: FinInvoice & { readonly total: Decimal },
  paid: Decimal,
  credited: Decimal,
  amount: string,
): void {
  const remaining = new Money(invoice.total.toString()).minus(paid).minus(credited);
  if (new Money(amount).greaterThan(remaining)) {
    throw paymentInvalid('El recaudo supera el saldo pendiente de la factura.');
  }
}

async function updatePaymentStatus(
  tx: TenantTransaction,
  invoice: FinInvoice & { readonly total: Decimal },
  totals: { readonly paid: Decimal; readonly credited: Decimal },
  amount: string,
): Promise<void> {
  const status = totals.paid
    .plus(amount)
    .plus(totals.credited)
    .greaterThanOrEqualTo(invoice.total.toString())
    ? 'paid'
    : 'partially_paid';
  const result = await tx.finInvoice.updateMany({
    where: { id: invoice.id, version: invoice.version, status: invoice.status, deletedAt: null },
    data: { status },
  });
  if (result.count === 0) throw versionConflict();
}

async function auditPayment(
  tx: TenantTransaction,
  actor: InvoiceActor,
  paymentId: string,
  invoiceId: string,
  input: CreatePayment,
  at: Date,
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: actor.principal.tenantId,
    occurredAt: at,
    actor: { kind: 'user', id: actor.principal.userId },
    action: 'finance.payment.record',
    entityType: 'fin_payment',
    entityId: paymentId,
    result: 'success',
    changes: {
      invoice_id: invoiceId,
      paid_on: input.paid_on,
      amount: input.amount,
      method: input.method,
      reference: input.reference,
    },
    meta: actor.meta,
  });
  await addOutboxEvent(tx, {
    tenantId: actor.principal.tenantId,
    eventType: 'fin.payment.recorded',
    actorId: actor.principal.userId,
    occurredAt: at,
    payload: { id: paymentId, invoice_id: invoiceId, amount: input.amount },
  });
}

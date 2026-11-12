import { Decimal } from 'decimal.js';
import type { CreateCreditNote } from '@arza/contracts';

import type { FinInvoice } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { isAttachableFile } from '../../doc/index.js';
import {
  creditNoteInvalid,
  fiscalFileInvalid,
  invoiceNotFound,
  invoiceStatusInvalid,
} from './invoice-messages.js';
import type { InvoiceActor } from './invoice-actor.js';
import { assertPeriodOpen } from './ledger-support.js';

const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export async function createCreditNote(
  tx: TenantTransaction,
  actor: InvoiceActor,
  id: string,
  key: string,
  input: CreateCreditNote,
  at: Date,
): Promise<string> {
  const prior = await tx.finCreditNote.findFirst({ where: { requestKey: key, deletedAt: null } });
  if (prior !== null)
    return prior.invoiceId === id && prior.fiscalNumber === input.fiscal_number
      ? prior.id
      : reuseKey();
  const invoice = await loadCreditTarget(tx, id);
  await validateCreditFile(tx, actor, input.fiscal_file_id);
  await assertPeriodOpen(tx, input.issue_date);
  const settled = await settledAmount(tx, id);
  validateCreditAmount(invoice, settled, input.amount);
  const note = await tx.finCreditNote.create({
    data: {
      tenantId: actor.principal.tenantId,
      invoiceId: id,
      reason: input.reason,
      amount: input.amount,
      issueDate: new Date(`${input.issue_date}T00:00:00.000Z`),
      fiscalNumber: input.fiscal_number,
      fiscalUuid: input.fiscal_uuid,
      fiscalFileId: input.fiscal_file_id,
      requestKey: key,
      createdBy: actor.principal.userId,
    },
  });
  await updateCreditStatus(tx, invoice, settled, input.amount);
  await auditCreditNote(tx, actor, note.id, id, input, at);
  return note.id;
}

function reuseKey(): never {
  throw idempotencyKeyReused();
}

async function loadCreditTarget(
  tx: TenantTransaction,
  id: string,
): Promise<FinInvoice & { readonly total: Decimal }> {
  const invoice = await tx.finInvoice.findFirst({ where: { id, deletedAt: null } });
  if (invoice === null) throw invoiceNotFound();
  if (!['issued', 'partially_paid', 'paid'].includes(invoice.status)) {
    throw invoiceStatusInvalid('Registre una nota crédito solo sobre una factura emitida.');
  }
  if (invoice.total === null) {
    throw invoiceStatusInvalid('La factura no tiene valores fiscales registrados.');
  }
  const total = invoice.total;
  return { ...invoice, total };
}

async function validateCreditFile(
  tx: TenantTransaction,
  actor: InvoiceActor,
  fileId: string,
): Promise<void> {
  if (!(await isAttachableFile(tx, actor.principal, fileId))) throw fiscalFileInvalid();
}

/** Lo ya cubierto de la factura: notas crédito anteriores más recaudos. */
async function settledAmount(tx: TenantTransaction, id: string): Promise<Decimal> {
  const where = { invoiceId: id, deletedAt: null };
  const [notes, payments] = await Promise.all([
    tx.finCreditNote.findMany({ where, select: { amount: true } }),
    tx.finPayment.findMany({ where, select: { amount: true } }),
  ]);
  return [...notes, ...payments].reduce(
    (sum, row) => sum.plus(row.amount.toString()),
    new Money(0),
  );
}

function validateCreditAmount(
  invoice: FinInvoice & { readonly total: Decimal },
  settled: Decimal,
  amount: string,
): void {
  // Devolver dinero ya recaudado no hace parte de este bloque: la nota crédito cubre saldo.
  if (settled.plus(amount).greaterThan(invoice.total.toString())) {
    throw creditNoteInvalid('La nota crédito supera el saldo pendiente de la factura.');
  }
}

async function updateCreditStatus(
  tx: TenantTransaction,
  invoice: FinInvoice & { readonly total: Decimal },
  settled: Decimal,
  amount: string,
): Promise<void> {
  const covered = settled.plus(amount).greaterThanOrEqualTo(invoice.total.toString());
  const result = await tx.finInvoice.updateMany({
    where: { id: invoice.id, version: invoice.version, status: invoice.status, deletedAt: null },
    data: { status: covered ? 'paid' : invoice.status },
  });
  if (result.count === 0) throw versionConflict();
}

async function auditCreditNote(
  tx: TenantTransaction,
  actor: InvoiceActor,
  noteId: string,
  invoiceId: string,
  input: CreateCreditNote,
  at: Date,
): Promise<void> {
  await recordAuditEvent(tx, {
    tenantId: actor.principal.tenantId,
    occurredAt: at,
    actor: { kind: 'user', id: actor.principal.userId },
    action: 'finance.credit_note.register',
    entityType: 'fin_credit_note',
    entityId: noteId,
    result: 'success',
    changes: {
      invoice_id: invoiceId,
      reason: input.reason,
      amount: input.amount,
      issue_date: input.issue_date,
      fiscal_number: input.fiscal_number,
      fiscal_file_id: input.fiscal_file_id,
    },
    meta: actor.meta,
  });
  await addOutboxEvent(tx, {
    tenantId: actor.principal.tenantId,
    eventType: 'fin.credit.note.registered',
    actorId: actor.principal.userId,
    occurredAt: at,
    payload: { id: noteId, invoice_id: invoiceId },
  });
}

import type { RegisterFiscalInvoice } from '@arza/contracts';

import type { FinInvoice } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { isAttachableFile } from '../../doc/index.js';
import { fiscalFileInvalid, invoiceStatusInvalid } from './invoice-messages.js';
import type { InvoiceActor } from './invoice-actor.js';
import { recordInvoiceEvent } from './invoice-events.js';

export async function registerFiscalInvoice(
  tx: TenantTransaction,
  actor: InvoiceActor,
  invoice: FinInvoice,
  version: number,
  key: string,
  input: RegisterFiscalInvoice,
  at: Date,
): Promise<void> {
  if (validateFiscalRequest(invoice, key, input)) return;
  await validateFiscalFile(tx, actor, input.fiscal_file_id);
  await persistFiscalInvoice(tx, invoice.id, version, key, input);
  await updateFiscalItem(tx, invoice.id, input);
  await recordInvoiceEvent(tx, actor, at, {
    action: 'finance.invoice.register_fiscal',
    event: 'fin.invoice.issued',
    invoice,
    changes: fiscalAuditChanges(input),
  });
}

function validateFiscalRequest(
  invoice: FinInvoice,
  key: string,
  input: RegisterFiscalInvoice,
): boolean {
  if (invoice.fiscalKey === key && invoice.status === 'issued') return true;
  if (invoice.fiscalKey !== null) throw idempotencyKeyReused();
  if (invoice.status !== 'approved') {
    throw invoiceStatusInvalid('Apruebe la solicitud antes de registrar el documento fiscal.');
  }
  if (input.due_date < input.issue_date) {
    throw invoiceStatusInvalid('La fecha de vencimiento no puede ser anterior a la emisión.');
  }
  return false;
}

async function validateFiscalFile(
  tx: TenantTransaction,
  actor: InvoiceActor,
  fileId: string,
): Promise<void> {
  if (!(await isAttachableFile(tx, actor.principal, fileId))) throw fiscalFileInvalid();
}

async function persistFiscalInvoice(
  tx: TenantTransaction,
  id: string,
  version: number,
  key: string,
  input: RegisterFiscalInvoice,
): Promise<void> {
  const { count } = await tx.finInvoice.updateMany({
    where: { id, version, status: 'approved', deletedAt: null },
    data: {
      status: 'issued',
      issueDate: new Date(`${input.issue_date}T00:00:00.000Z`),
      dueDate: new Date(`${input.due_date}T00:00:00.000Z`),
      subtotal: input.subtotal,
      taxTotal: input.tax_total,
      withholdingTotal: input.withholding_total,
      total: input.total,
      fiscalNumber: input.fiscal_number,
      fiscalUuid: input.fiscal_uuid,
      fiscalFileId: input.fiscal_file_id,
      fiscalKey: key,
    },
  });
  if (count === 0) throw versionConflict();
}

async function updateFiscalItem(
  tx: TenantTransaction,
  invoiceId: string,
  input: RegisterFiscalInvoice,
): Promise<void> {
  await tx.finInvoiceItem.updateMany({
    where: { invoiceId, position: 1, deletedAt: null },
    data: { unitPrice: input.subtotal, lineTotal: input.subtotal, taxRate: input.tax_rate },
  });
}

function fiscalAuditChanges(input: RegisterFiscalInvoice) {
  return {
    status: ['approved', 'issued'],
    fiscal_number: input.fiscal_number,
    issue_date: input.issue_date,
    due_date: input.due_date,
    subtotal: input.subtotal,
    tax_rate: input.tax_rate,
    tax_total: input.tax_total,
    withholding_total: input.withholding_total,
    total: input.total,
    fiscal_file_id: input.fiscal_file_id,
  };
}

import { Decimal } from 'decimal.js';
import {
  invoiceStatusSchema,
  type InvoiceDetail,
  type InvoiceSummary,
  type PortalInvoice,
} from '@arza/contracts';

import type {
  FinCreditNote,
  FinInvoice,
  FinInvoiceItem,
  Prisma,
} from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { commercialParties } from '../../party/index.js';

const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const ZERO = new Money(0);

function money(value: Decimal.Value): string {
  return new Money(value).toFixed(2);
}

async function paidTotal(tx: TenantTransaction, invoiceId: string): Promise<Decimal> {
  const rows = await tx.finPayment.findMany({
    where: { invoiceId, deletedAt: null },
    select: { amount: true },
  });
  return rows.reduce((total, row) => total.plus(row.amount.toString()), ZERO);
}

async function creditedTotal(tx: TenantTransaction, invoiceId: string): Promise<Decimal> {
  const rows = await tx.finCreditNote.findMany({
    where: { invoiceId, deletedAt: null },
    select: { amount: true },
  });
  return rows.reduce((total, row) => total.plus(row.amount.toString()), ZERO);
}

async function invoiceSummary(
  tx: TenantTransaction,
  invoice: FinInvoice,
  partyName: string,
  totals?: { readonly paid: Decimal; readonly credited: Decimal },
): Promise<InvoiceSummary> {
  const [paid, credited] =
    totals === undefined
      ? await Promise.all([paidTotal(tx, invoice.id), creditedTotal(tx, invoice.id)])
      : [totals.paid, totals.credited];
  const balance =
    invoice.total === null
      ? null
      : Money.max(new Money(invoice.total.toString()).minus(paid).minus(credited), ZERO);
  return {
    id: invoice.id,
    code: invoice.code,
    party: { id: invoice.partyId, name: partyName },
    milestone_id: invoice.milestoneId,
    requested_amount: invoice.requestedAmount.toFixed(2),
    status: invoiceStatusSchema.parse(invoice.status),
    issue_date: invoice.issueDate === null ? null : toCalendarDate(invoice.issueDate),
    due_date: invoice.dueDate === null ? null : toCalendarDate(invoice.dueDate),
    subtotal: invoice.subtotal?.toFixed(2) ?? null,
    tax_total: invoice.taxTotal?.toFixed(2) ?? null,
    withholding_total: invoice.withholdingTotal?.toFixed(2) ?? null,
    total: invoice.total?.toFixed(2) ?? null,
    fiscal_number: invoice.fiscalNumber,
    fiscal_uuid: invoice.fiscalUuid,
    fiscal_file_id: invoice.fiscalFileId,
    paid_total: money(paid),
    balance: balance === null ? null : money(balance),
    version: invoice.version,
  };
}

export async function invoiceList(tx: TenantTransaction): Promise<InvoiceSummary[]> {
  const invoices = await tx.finInvoice.findMany({
    where: { deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 200,
  });
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const [parties, payments, notes] = await Promise.all([
    commercialParties(
      tx,
      invoices.map((invoice) => invoice.partyId),
    ),
    invoiceIds.length === 0
      ? Promise.resolve([])
      : tx.finPayment.findMany({
          where: { invoiceId: { in: invoiceIds }, deletedAt: null },
          select: { invoiceId: true, amount: true },
        }),
    invoiceIds.length === 0
      ? Promise.resolve([])
      : tx.finCreditNote.findMany({
          where: { invoiceId: { in: invoiceIds }, deletedAt: null },
          select: { invoiceId: true, amount: true },
        }),
  ]);
  const paidByInvoice = sumAmountsByInvoice(payments);
  const creditedByInvoice = sumAmountsByInvoice(notes);
  return Promise.all(
    invoices.map((invoice) =>
      invoiceSummary(tx, invoice, parties.get(invoice.partyId)?.name ?? 'Cliente', {
        paid: paidByInvoice.get(invoice.id) ?? ZERO,
        credited: creditedByInvoice.get(invoice.id) ?? ZERO,
      }),
    ),
  );
}

function sumAmountsByInvoice(
  rows: readonly { readonly invoiceId: string; readonly amount: Decimal }[],
): Map<string, Decimal> {
  const totals = new Map<string, Decimal>();
  for (const row of rows) {
    totals.set(row.invoiceId, (totals.get(row.invoiceId) ?? ZERO).plus(row.amount.toString()));
  }
  return totals;
}

export async function invoiceDetail(
  tx: TenantTransaction,
  invoice: FinInvoice,
  partyName: string,
  items: readonly FinInvoiceItem[],
  notes: readonly FinCreditNote[],
): Promise<InvoiceDetail> {
  return {
    ...(await invoiceSummary(tx, invoice, partyName)),
    contract_id: invoice.contractId,
    void_reason: invoice.voidReason,
    items: items.map((item) => ({
      id: item.id,
      position: item.position,
      description: item.description,
      quantity: item.quantity.toFixed(2),
      unit_price: item.unitPrice.toFixed(2),
      tax_rate: item.taxRate?.toFixed(2) ?? null,
      line_total: item.lineTotal.toFixed(2),
    })),
    credit_notes: notes.map((note) => ({
      id: note.id,
      reason: note.reason,
      amount: note.amount.toFixed(2),
      issue_date: toCalendarDate(note.issueDate),
      fiscal_number: note.fiscalNumber,
      fiscal_uuid: note.fiscalUuid,
      fiscal_file_id: note.fiscalFileId,
    })),
  };
}

/** El portal muestra solo documentos fiscales ya emitidos para la empresa autenticada. */
export async function clientInvoices(
  tx: TenantTransaction,
  partyId: string,
): Promise<PortalInvoice[]> {
  const invoices = await tx.finInvoice.findMany({
    where: {
      partyId,
      status: { in: ['issued', 'partially_paid', 'paid'] },
      fiscalFileId: { not: null },
      deletedAt: null,
    },
    orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
    include: {
      creditNotes: {
        where: { deletedAt: null },
        orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
      },
    },
  });
  return invoices.flatMap((invoice) => portalInvoice(invoice));
}

function portalInvoice(
  invoice: Prisma.FinInvoiceGetPayload<{ include: { creditNotes: true } }>,
): PortalInvoice[] {
  if (
    invoice.issueDate === null ||
    invoice.dueDate === null ||
    invoice.total === null ||
    invoice.fiscalNumber === null ||
    invoice.fiscalFileId === null
  )
    return [];
  return [
    {
      id: invoice.id,
      code: invoice.code,
      status: invoiceStatusSchema.parse(invoice.status),
      issue_date: toCalendarDate(invoice.issueDate),
      due_date: toCalendarDate(invoice.dueDate),
      total: invoice.total.toFixed(2),
      fiscal_number: invoice.fiscalNumber,
      fiscal_uuid: invoice.fiscalUuid,
      fiscal_file_id: invoice.fiscalFileId,
      credit_notes: invoice.creditNotes.map((note) => ({
        id: note.id,
        issue_date: toCalendarDate(note.issueDate),
        amount: note.amount.toFixed(2),
        fiscal_number: note.fiscalNumber,
        fiscal_uuid: note.fiscalUuid,
      })),
    },
  ];
}

/** Devuelve únicamente el archivo de una factura emitida de la empresa del portal. */
export async function clientInvoiceFile(
  tx: TenantTransaction,
  partyId: string,
  invoiceId: string,
): Promise<string | null> {
  const invoice = await tx.finInvoice.findFirst({
    where: {
      id: invoiceId,
      partyId,
      status: { in: ['issued', 'partially_paid', 'paid'] },
      deletedAt: null,
    },
    select: { fiscalFileId: true },
  });
  return invoice?.fiscalFileId ?? null;
}

/** Devuelve el soporte de una nota crédito solo si pertenece a la factura de esa empresa. */
export async function clientCreditNoteFile(
  tx: TenantTransaction,
  partyId: string,
  invoiceId: string,
  noteId: string,
): Promise<string | null> {
  const note = await tx.finCreditNote.findFirst({
    where: {
      id: noteId,
      invoiceId,
      deletedAt: null,
      invoice: {
        partyId,
        status: { in: ['issued', 'partially_paid', 'paid'] },
        deletedAt: null,
      },
    },
    select: { fiscalFileId: true },
  });
  return note?.fiscalFileId ?? null;
}

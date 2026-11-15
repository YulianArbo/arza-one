import { z } from 'zod';

import { moneySchema, positiveMoneySchema } from './money.js';
import { taxRateSchema } from './tax-parameters.js';

// Facturación y recaudos de M10 (B31). Los importes fiscales se capturan del documento emitido;
// este contrato no calcula impuestos ni acepta la creación de notas débito.

export const INVOICE_STATUS = [
  'requested',
  'approved',
  'issued',
  'partially_paid',
  'paid',
  'voided',
] as const;

export const invoiceStatusSchema = z.enum(INVOICE_STATUS);

const idSchema = z.uuid();
const dateSchema = z.iso.date();

export const invoiceSummarySchema = z.object({
  id: idSchema,
  code: z.string(),
  party: z.object({ id: idSchema, name: z.string() }),
  milestone_id: idSchema,
  requested_amount: positiveMoneySchema,
  status: invoiceStatusSchema,
  issue_date: dateSchema.nullable(),
  due_date: dateSchema.nullable(),
  subtotal: moneySchema.nullable(),
  tax_total: moneySchema.nullable(),
  withholding_total: moneySchema.nullable(),
  total: positiveMoneySchema.nullable(),
  fiscal_number: z.string().nullable(),
  fiscal_uuid: z.string().nullable(),
  fiscal_file_id: idSchema.nullable(),
  paid_total: moneySchema,
  balance: moneySchema.nullable(),
  version: z.number().int().positive(),
});

export const invoiceListResponseSchema = z.object({ data: z.array(invoiceSummarySchema) });
export const billableMilestoneSchema = z.object({
  id: idSchema,
  project_code: z.string(),
  project_name: z.string(),
  party: z.object({ id: idSchema, name: z.string() }),
  contract_id: idSchema.nullable(),
  name: z.string(),
  amount: positiveMoneySchema,
});
export const billableMilestonesResponseSchema = z.object({
  data: z.array(billableMilestoneSchema),
});
export const invoiceDetailResponseSchema = invoiceSummarySchema.extend({
  contract_id: idSchema.nullable(),
  void_reason: z.string().nullable(),
  items: z.array(
    z.object({
      id: idSchema,
      position: z.number().int().positive(),
      description: z.string(),
      quantity: z.string(),
      unit_price: moneySchema,
      tax_rate: z.string().nullable(),
      line_total: moneySchema,
    }),
  ),
  credit_notes: z.array(
    z.object({
      id: idSchema,
      reason: z.string(),
      amount: positiveMoneySchema,
      issue_date: dateSchema,
      fiscal_number: z.string(),
      fiscal_uuid: z.string().nullable(),
      fiscal_file_id: idSchema,
    }),
  ),
});

export const invoiceDetailEnvelopeSchema = z.object({ data: invoiceDetailResponseSchema });
export const invoiceCreatedResponseSchema = z.object({ id: idSchema });

export const requestInvoiceSchema = z.strictObject({ milestone_id: idSchema });
export const registerFiscalInvoiceSchema = z.strictObject({
  issue_date: dateSchema,
  due_date: dateSchema,
  subtotal: moneySchema,
  tax_rate: taxRateSchema.nullable(),
  tax_total: moneySchema,
  withholding_total: moneySchema,
  total: positiveMoneySchema,
  fiscal_number: z.string().trim().min(1).max(120),
  fiscal_uuid: z.string().trim().min(1).max(120).nullable(),
  fiscal_file_id: idSchema,
});
export const voidInvoiceSchema = z.strictObject({ reason: z.string().trim().min(3).max(2000) });
export const createCreditNoteSchema = z.strictObject({
  reason: z.string().trim().min(3).max(2000),
  amount: positiveMoneySchema,
  issue_date: dateSchema,
  fiscal_number: z.string().trim().min(1).max(120),
  fiscal_uuid: z.string().trim().min(1).max(120).nullable(),
  fiscal_file_id: idSchema,
});
export const createPaymentSchema = z.strictObject({
  paid_on: dateSchema,
  amount: positiveMoneySchema,
  method: z.string().trim().min(2).max(80),
  reference: z.string().trim().max(160).nullable(),
  support_file_id: idSchema.nullable(),
});

export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;
export type InvoiceDetail = z.infer<typeof invoiceDetailResponseSchema>;
export type InvoiceListResponse = z.infer<typeof invoiceListResponseSchema>;
export type BillableMilestone = z.infer<typeof billableMilestoneSchema>;
export type InvoiceDetailEnvelope = z.infer<typeof invoiceDetailEnvelopeSchema>;
export type RequestInvoice = z.infer<typeof requestInvoiceSchema>;
export type RegisterFiscalInvoice = z.infer<typeof registerFiscalInvoiceSchema>;
export type VoidInvoice = z.infer<typeof voidInvoiceSchema>;
export type CreateCreditNote = z.infer<typeof createCreditNoteSchema>;
export type CreatePayment = z.infer<typeof createPaymentSchema>;

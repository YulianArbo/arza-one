import { z } from 'zod';

import { invoiceStatusSchema } from '../finance/invoices.js';

/** Facturas emitidas que puede consultar el cliente en su portal (B31). */
export const portalInvoiceSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  status: invoiceStatusSchema,
  issue_date: z.iso.date(),
  due_date: z.iso.date(),
  total: z.string(),
  fiscal_number: z.string(),
  fiscal_uuid: z.string().nullable(),
  fiscal_file_id: z.uuid(),
  credit_notes: z.array(
    z.object({
      id: z.uuid(),
      issue_date: z.iso.date(),
      amount: z.string(),
      fiscal_number: z.string(),
      fiscal_uuid: z.string().nullable(),
    }),
  ),
});

export const portalInvoiceListSchema = z.object({ data: z.array(portalInvoiceSchema) });
export type PortalInvoice = z.infer<typeof portalInvoiceSchema>;
export type PortalInvoiceList = z.infer<typeof portalInvoiceListSchema>;

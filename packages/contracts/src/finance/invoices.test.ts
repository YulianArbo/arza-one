import { describe, expect, it } from 'vitest';

import {
  createCreditNoteSchema,
  createPaymentSchema,
  invoiceStatusSchema,
  registerFiscalInvoiceSchema,
  requestInvoiceSchema,
} from './invoices.js';

const ID = '0195f3a2-7c41-7b9e-9d2a-3f4e5a6b7c8d';

describe('contratos de facturas B31', () => {
  it('permite solicitar una factura solo desde un hito', () => {
    expect(requestInvoiceSchema.safeParse({ milestone_id: ID }).success).toBe(true);
    expect(requestInvoiceSchema.safeParse({ milestone_id: ID, amount: '100.00' }).success).toBe(
      false,
    );
  });

  it('acepta únicamente estados de factura definidos', () => {
    expect(invoiceStatusSchema.safeParse('issued').success).toBe(true);
    expect(invoiceStatusSchema.safeParse('debit_note').success).toBe(false);
  });

  it('registra datos fiscales y sus valores sin campos calculados por la plataforma', () => {
    expect(registerFiscalInvoiceSchema.safeParse(validFiscalInvoice()).success).toBe(true);
  });

  it('valida recaudos y notas crédito positivos', () => {
    expect(createPaymentSchema.safeParse(validPayment()).success).toBe(true);
    expect(createCreditNoteSchema.safeParse(invalidCreditNote()).success).toBe(false);
  });
});

function validFiscalInvoice() {
  return {
    issue_date: '2026-11-08',
    due_date: '2026-12-08',
    subtotal: '1000000.00',
    tax_rate: '19.00',
    tax_total: '190000.00',
    withholding_total: '0.00',
    total: '1190000.00',
    fiscal_number: 'FE-2026-001',
    fiscal_uuid: null,
    fiscal_file_id: ID,
  };
}

function validPayment() {
  return {
    paid_on: '2026-11-08',
    amount: '150.00',
    method: 'transferencia',
    reference: null,
    support_file_id: null,
  };
}

function invalidCreditNote() {
  return {
    reason: 'Corrección de valor',
    amount: '0.00',
    issue_date: '2026-11-08',
    fiscal_number: 'NC-2026-001',
    fiscal_uuid: null,
    fiscal_file_id: ID,
  };
}

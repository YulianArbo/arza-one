import { describe, expect, it } from 'vitest';

import { percentText, pesos, quoteDocumentBody, type QuoteDocument } from './quote-document.js';

const QUOTE: QuoteDocument = {
  code: 'COT-2026-0001',
  versionNumber: 2,
  issuedOn: '28/10/2026',
  validUntil: '27/11/2026',
  company: { legalName: 'ARZA TECH S.A.S.', taxId: '900000000-1' },
  client: 'Cliente <Demo>',
  opportunity: 'Portal de clientes',
  preparedBy: 'Ana Comercial',
  lines: [
    {
      position: 1,
      description: 'Desarrollo\nfase 1',
      unit: 'Hora',
      quantity: '1.50',
      unitPrice: '120000.50',
      discountPercent: '7.50',
      taxRate: '19.00',
      lineTotal: '198135.82',
    },
  ],
  subtotal: '180000.75',
  discountTotal: '13500.06',
  taxes: [{ taxRate: '19.00', base: '166500.69', tax: '31635.13' }],
  total: '198135.82',
  paymentTerms: '50 % al iniciar',
  deliveryTerms: '30 días',
  warranty: null,
  notes: null,
};

describe('Propuesta Comercial FT-COM-001', () => {
  it('escribe los pesos y los porcentajes como se leen en Colombia', () => {
    expect(pesos('1190000.50')).toBe('$ 1.190.000,50');
    expect(pesos('0.00')).toBe('$ 0,00');
    expect(pesos('-13500.06')).toBe('-$ 13.500,06');
    expect(percentText('19.00')).toBe('19 %');
    expect(percentText('7.50')).toBe('7,5 %');
  });

  it('lleva los ítems, los totales y las condiciones, y escapa lo que escribió una persona', () => {
    const body = quoteDocumentBody(QUOTE);
    expect(body).toContain('COT-2026-0001 · versión 2');
    expect(body).toContain('Cliente &lt;Demo&gt;');
    expect(body).toContain('Desarrollo<br>fase 1');
    expect(body).toContain('IVA 19 % sobre $ 166.500,69');
    expect(body).toContain('$ 198.135,82');
    expect(body).toContain('50 % al iniciar');
    expect(body).not.toContain('Garantía');
    expect(body).not.toContain('<h2>Notas</h2>');
  });
});

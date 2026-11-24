import { describe, expect, it } from 'vitest';

import { pdfSealFromPkcs12, temporaryPdfSeal } from '../src/platform/pdf/pdf-seal.js';
import { checkPdfSeal, minimalPdf } from './support/sealed-pdf.js';

// Sello de integridad de la empresa (numeral 19.3, B43).

const NOW = new Date('2026-11-24T15:00:00Z');
const seal = temporaryPdfSeal('ARZA ONE (pruebas)', NOW);

describe('sello de integridad del PDF firmado', () => {
  it('un lector de PDF confirma el sello y reconoce el certificado de la empresa', async () => {
    const sealed = await seal.seal(minimalPdf('Contrato ficticio'), NOW);
    const check = checkPdfSeal(sealed);
    expect(check.intact).toBe(true);
    expect(check.holder).toBe('ARZA ONE (pruebas)');
    expect(check.certificateSha256).toBe(seal.certificateSha256);
    expect(seal.certificateSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('el sello conserva el documento original al comienzo del archivo', async () => {
    const original = minimalPdf('Contrato ficticio');
    const sealed = await seal.seal(original, NOW);
    expect(sealed.subarray(0, original.length).equals(original)).toBe(true);
  });

  it('detecta un cambio hecho después del sello', async () => {
    const sealed = await seal.seal(minimalPdf('Valor: 1000000'), NOW);
    const altered = Buffer.from(sealed.toString('latin1').replace('1000000', '9000000'), 'latin1');
    expect(altered.length).toBe(sealed.length);
    expect(checkPdfSeal(altered).intact).toBe(false);
  });

  it('cada certificado temporal es distinto', () => {
    expect(temporaryPdfSeal('Otro', NOW).certificateSha256).not.toBe(seal.certificateSha256);
  });

  it('no arranca con un certificado que no abre', () => {
    expect(() => pdfSealFromPkcs12(Buffer.from('no es un certificado'), 'clave')).toThrow();
  });

  it('rechaza un archivo que no es PDF en lugar de sellar basura', async () => {
    await expect(seal.seal(Buffer.from('texto plano'), NOW)).rejects.toThrow();
  });
});

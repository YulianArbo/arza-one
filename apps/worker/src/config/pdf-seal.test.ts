import { describe, expect, it } from 'vitest';

import { pdfSealFrom } from './pdf-seal.js';

const NOW = new Date('2026-11-24T15:00:00Z');

describe('sello de los PDF firmados del worker (B43)', () => {
  it('sin certificado configurado usa uno temporal sin validez', () => {
    const seal = pdfSealFrom({ APP_ENV: 'local' }, NOW);
    expect(seal.holder).toBe('ARZA ONE (local, sin validez)');
    expect(seal.certificateSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('con certificado configurado lo abre; si no abre, no arranca', () => {
    // La apertura de un certificado válido se prueba en la API (test/pdf-seal.test.ts).
    expect(() =>
      pdfSealFrom(
        { APP_ENV: 'production', PDF_SEAL_PKCS12: 'ZmljdGljaW8=', PDF_SEAL_PASSPHRASE: 'x' },
        NOW,
      ),
    ).toThrow();
  });
});

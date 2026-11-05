import { describe, expect, it } from 'vitest';

import {
  evidenceCertificateBody,
  signaturesPageBody,
  type SignatureEvidence,
} from './signature-evidence.js';

const EVIDENCE: SignatureEvidence = {
  envelopeCode: 'FE-2026-0001',
  documentCode: 'CTR-2026-0001',
  documentTitle: 'Desarrollo del portal <web>',
  documentSha256: 'a'.repeat(64),
  companyName: 'ARZA TECH S.A.S.',
  verificationCode: 'ABCD-EFGH-JKLM',
  verifyUrl: 'https://arza.test/verificar',
  completedAtBogota: '30/10/2026, 3:05 p. m.',
  completedAtUtc: '2026-10-30T20:05:00.000Z',
  signers: [
    {
      name: 'Ana Pérez',
      idNumber: 'CC 1020304050',
      role: 'Por Cliente Uno S.A.S.',
      email: 'ana@cliente.test',
      method: 'Enlace único y código de un solo uso enviado a su correo',
      signedAtBogota: '30/10/2026, 2:00 p. m.',
      signedAtUtc: '2026-10-30T19:00:00.000Z',
      ip: '190.0.0.1',
      userAgent: 'Navegador <script>',
      acceptanceText:
        'He leído y acepto el contenido de este documento y lo firmo electrónicamente.',
    },
  ],
  events: [
    {
      sequence: 1,
      label: 'Proceso preparado',
      signer: '—',
      atBogota: '30/10/2026, 1:00 p. m.',
      atUtc: '2026-10-30T18:00:00.000Z',
      ip: '—',
      hash: 'b'.repeat(64),
    },
  ],
};

describe('página de firmas y certificado de evidencia', () => {
  it('la página de firmas trae quién firmó, cuándo y el código de verificación', () => {
    const html = signaturesPageBody(EVIDENCE);
    expect(html).toContain('PÁGINA DE FIRMAS');
    expect(html).toContain('Ana Pérez');
    expect(html).toContain('CC 1020304050');
    expect(html).toContain('30/10/2026, 2:00 p. m.');
    expect(html).toContain('ABCD-EFGH-JKLM');
    expect(html).toContain('https://arza.test/verificar');
  });

  it('el certificado trae la huella, la IP, el texto aceptado y la cadena de eventos', () => {
    const html = evidenceCertificateBody(EVIDENCE);
    expect(html).toContain('a'.repeat(64));
    expect(html).toContain('190.0.0.1');
    expect(html).toContain('2026-10-30T19:00:00.000Z');
    expect(html).toContain('He leído y acepto');
    expect(html).toContain('b'.repeat(64));
  });

  it('escapa lo que escribió una persona', () => {
    const html = evidenceCertificateBody(EVIDENCE);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(signaturesPageBody(EVIDENCE)).toContain('&lt;web&gt;');
  });
});

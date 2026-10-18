import { describe, expect, it } from 'vitest';

import { dispositionCertificateBody } from './index.js';

const CERTIFICATE = {
  code: 'DIS-2026-0001',
  period: 'octubre de 2026',
  proposedOn: '01/10/2026',
  sentBy: 'Ana Prueba',
  sentOn: '02/10/2026',
  approvedBy: 'Laura Díaz',
  approvedOn: '03/10/2026',
  executedOn: '03/10/2026',
  disposed: [
    {
      code: 'DOC-2015-0001',
      title: 'Contrato <viejo>',
      series: 'CON-01 · Contratos',
      dueOn: '01/01/2026',
      legalBasis: 'Ley 962 de 2005, art. 28',
    },
  ],
  kept: [
    {
      code: 'PR-SGC-001',
      title: 'Control de documentos',
      series: 'SGC · Documentos del SGC',
      reason: 'Valor histórico',
    },
  ],
};

describe('Acta de disposición final', () => {
  it('lista lo eliminado y lo conservado, con quién revisó y aprobó', () => {
    const html = dispositionCertificateBody(CERTIFICATE);
    expect(html).toContain('DIS-2026-0001 · octubre de 2026');
    expect(html).toContain('Documentos eliminados (1)');
    expect(html).toContain('DOC-2015-0001');
    expect(html).toContain('Documentos conservados (1)');
    expect(html).toContain('Valor histórico');
    expect(html).toContain('Laura Díaz · 03/10/2026');
  });

  it('escapa lo que escribieron las personas', () => {
    const html = dispositionCertificateBody(CERTIFICATE);
    expect(html).toContain('Contrato &lt;viejo&gt;');
    expect(html).not.toContain('<viejo>');
  });

  it('dice cuando no hay documentos en un grupo', () => {
    const html = dispositionCertificateBody({ ...CERTIFICATE, kept: [] });
    expect(html).toContain('Ningún documento se conservó.');
  });
});

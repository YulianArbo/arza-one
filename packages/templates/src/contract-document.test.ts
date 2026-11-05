import { describe, expect, it } from 'vitest';

import { contractDocumentBody } from './contract-document.js';

describe('Cuerpo del contrato', () => {
  const body = contractDocumentBody({
    heading: 'CONTRATO DE PRESTACIÓN DE SERVICIOS',
    code: 'CTR-2026-0001',
    clauses: [
      { ordinal: null, title: 'Partes', body: 'Entre <ARZA> y el cliente.' },
      { ordinal: 'PRIMERA', title: 'Objeto', body: 'Desarrollar el portal.\nSegundo párrafo.' },
    ],
    closing: 'Para constancia, se firma.',
    signatures: [
      { role: 'EL CONTRATANTE', name: 'Laura Gómez', detail: 'CC 43000000' },
      { role: 'EL CONTRATISTA', name: 'ARZA TECH S.A.S.', detail: 'NIT 901000000-1' },
    ],
  });

  it('numera las cláusulas y deja el encabezado sin número', () => {
    expect(body).toContain('<strong>PRIMERA. OBJETO.</strong>');
    expect(body).not.toContain('PARTES.');
    expect(body).toContain('<p>Desarrollar el portal.</p><p>Segundo párrafo.</p>');
  });

  it('escapa lo que escribió una persona y deja el espacio de las firmas', () => {
    expect(body).toContain('Entre &lt;ARZA&gt; y el cliente.');
    expect(body).toContain('<strong>EL CONTRATANTE</strong><br>Laura Gómez<br>CC 43000000');
    expect(body).toContain('EL CONTRATISTA');
  });
});

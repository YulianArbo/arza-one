import { describe, expect, it } from 'vitest';

import { auditReportBody, managementReviewBody } from './index.js';

const REPORT = {
  code: 'AUD-2026-0001',
  process: 'P05 · Servicio al cliente',
  auditor: 'Ana Prueba',
  plannedOn: '01/12/2026',
  startedOn: '02/12/2026',
  reportedOn: '03/12/2026',
  objective: 'Verificar el tratamiento de las PQRSF',
  criteria: 'ISO 9001:2015',
  checklist: [
    {
      requirement: 'ISO 9001 8.2.1',
      question: '¿Se responde en plazo?',
      result: 'No conforme',
      evidence: 'Muestra <5>',
    },
  ],
  findings: [
    {
      type: 'No conformidad menor',
      requirement: '8.2.1',
      description: 'Respuesta tardía',
      evidence: 'PQR-2026-0003',
      followUp: 'NC-2026-0004',
    },
  ],
  conclusions: 'El proceso es conforme\ncon una excepción.',
};

describe('informe de auditoría (RE-SGC-004)', () => {
  it('lleva la lista de chequeo, los hallazgos con su seguimiento y las conclusiones', () => {
    const html = auditReportBody(REPORT);
    expect(html).toContain('AUD-2026-0001');
    expect(html).toContain('Muestra &lt;5&gt;');
    expect(html).toContain('NC-2026-0004');
    expect(html).toContain('Hallazgos (1)');
    expect(html).toContain('conforme<br>con una excepción');
  });

  it('dice cuando no hay hallazgos ni lista de chequeo', () => {
    const html = auditReportBody({ ...REPORT, checklist: [], findings: [] });
    expect(html).toContain('No se diligenció lista de chequeo.');
    expect(html).toContain('La auditoría no registró hallazgos.');
  });
});

describe('acta de revisión por la dirección (RE-SGC-007)', () => {
  const review = {
    code: 'RD-2026-0001',
    period: '01/01/2026 a 30/11/2026',
    meetingOn: '10/12/2026',
    attendees: 'Dirección y Calidad',
    sections: [
      { title: 'Satisfacción del cliente', lines: ['Encuestas: 10'], comment: 'Mejoró' },
      { title: 'Recursos', lines: [], comment: '' },
    ],
    conclusions: 'El sistema es eficaz.',
    decisions: [
      {
        description: 'Contratar <analista>',
        responsible: 'Laura',
        dueOn: '31/01/2027',
        action: 'AC-2026-0009',
      },
    ],
    approvedBy: 'Laura Díaz',
    approvedOn: '11/12/2026',
  };

  it('lleva las entradas, las conclusiones y las decisiones con su acción', () => {
    const html = managementReviewBody(review);
    expect(html).toContain('<li>Encuestas: 10</li>');
    expect(html).toContain('Contratar &lt;analista&gt;');
    expect(html).toContain('AC-2026-0009');
    expect(html).toContain('Laura Díaz · 11/12/2026');
  });

  it('dice cuando no hubo decisiones', () => {
    expect(managementReviewBody({ ...review, decisions: [] })).toContain(
      'La revisión no registró decisiones.',
    );
  });
});

import { describe, expect, it } from 'vitest';

import { personalDataReportBody } from './personal-data-report.js';

describe('informe de datos del titular', () => {
  it('muestra cada sección con sus datos y escapa lo escrito por personas', () => {
    const html = personalDataReportBody({
      company: 'Empresa de Prueba S.A.S.',
      holder: 'Titular <b>Prueba</b>',
      requestCode: 'PRV-2026-0001',
      generatedOn: '23/11/2026',
      sections: [
        {
          title: 'Ficha en Terceros',
          records: [{ title: 'Ficha', fields: [{ label: 'Correo', value: null }] }],
        },
      ],
    });
    expect(html).toContain('PRV-2026-0001');
    expect(html).toContain('<h2>Ficha en Terceros</h2>');
    expect(html).toContain('—');
    expect(html).not.toContain('<b>Prueba</b>');
  });
});

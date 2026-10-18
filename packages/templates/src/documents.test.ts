import { formDefinitionSchema } from '@arza/contracts';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import {
  controlledCopyStamp,
  docxTemplateVariables,
  fillDocxTemplate,
  formDocumentBody,
  framedPreview,
  htmlTemplateVariables,
  institutionalFooter,
  institutionalHeader,
  printPage,
  renderHtmlTemplate,
  templateContext,
  TemplateSyntaxError,
} from './index.js';

const DOCUMENT = {
  code: 'FT-COM-002',
  name: 'Acta de Revisión de Requisitos',
  version: '01',
  date: '18/10/2026',
};
const COMPANY = { legalName: 'Empresa de Prueba S.A.S.', taxId: '900000000-1' };
const FACTS = {
  code: 'FT-COM-002-2026-0001',
  status: 'Terminado',
  createdBy: 'Ana Prueba',
  createdOn: '18/10/2026',
  approvedBy: 'Laura Prueba',
  approvedOn: '19/10/2026',
};

const DEFINITION = formDefinitionSchema.parse({
  sections: [
    {
      key: 'general',
      title: 'Datos generales',
      fields: [
        { key: 'cliente', label: 'Cliente', type: 'text' },
        { key: 'fecha', label: 'Fecha de la reunión', type: 'date' },
        { key: 'acepta', label: '¿Acepta?', type: 'boolean' },
      ],
    },
    {
      key: 'detalle',
      title: 'Detalle',
      fields: [
        {
          key: 'verificacion',
          label: 'Verificación',
          type: 'checklist',
          items: ['Código correcto'],
        },
        {
          key: 'compromisos',
          label: 'Compromisos',
          type: 'table',
          columns: [
            { key: 'actividad', label: 'Actividad', type: 'text' },
            { key: 'fecha', label: 'Fecha', type: 'date' },
          ],
        },
      ],
    },
  ],
});

const DATA = {
  cliente: 'Cliente <script>alert(1)</script>',
  fecha: '2026-10-18',
  acepta: true,
  verificacion: [{ result: 'no', note: 'Falta el guion' }],
  compromisos: [{ actividad: 'Enviar cronograma', fecha: '2026-10-20' }],
} as const;

/** Un Word mínimo con el texto dado en un párrafo. */
function wordWith(text: string): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generate({ type: 'nodebuffer' });
}

function wordText(content: Buffer): string {
  return new PizZip(content).file('word/document.xml')?.asText() ?? '';
}

describe('encabezado y pie institucionales', () => {
  it('el encabezado lleva el logo, el nombre, el código, la versión, la fecha y la página', () => {
    const header = institutionalHeader(DOCUMENT, COMPANY);
    expect(header).toContain('data:image/png;base64,');
    expect(header).toContain('Acta de Revisión de Requisitos');
    expect(header).toContain('Código: FT-COM-002');
    expect(header).toContain('Versión: 01');
    expect(header).toContain('Fecha: 18/10/2026');
    expect(header).toContain(
      '<span class="pageNumber"></span> de <span class="totalPages"></span>',
    );
  });

  it('el pie lleva la empresa, el registro y la leyenda de copia no controlada', () => {
    const footer = institutionalFooter(COMPANY, FACTS.code);
    expect(footer).toContain('Empresa de Prueba S.A.S. · NIT 900000000-1 · FT-COM-002-2026-0001');
    expect(footer).toContain('Copia no controlada cuando se imprime');
  });

  it('la copia de consulta dice el código, la versión y la fecha de vigencia', () => {
    expect(controlledCopyStamp({ code: 'PR-SGC-001', version: '03', date: '01/10/2026' })).toBe(
      'PR-SGC-001 · Versión 03 · Vigente desde 01/10/2026 · Copia no controlada cuando se imprime',
    );
  });
});

describe('vista previa', () => {
  it('pone el encabezado arriba y el pie abajo de la página, con la página 1 de 1', () => {
    const preview = framedPreview({
      header: institutionalHeader(DOCUMENT, COMPANY),
      page: printPage('FT-COM-002', '<p>Contenido</p>'),
      footer: institutionalFooter(COMPANY, null),
    });
    const header = preview.indexOf('Código: FT-COM-002');
    expect(header).toBeGreaterThan(-1);
    expect(preview.indexOf('Contenido')).toBeGreaterThan(header);
    expect(preview.indexOf('Copia no controlada')).toBeGreaterThan(preview.indexOf('Contenido'));
    expect(preview).toContain('Página: 1 de 1');
  });
});

describe('maqueta del formato diligenciado', () => {
  const page = printPage('FT-COM-002', formDocumentBody(DEFINITION, DATA, FACTS));

  it('imprime cada sección con sus valores: fechas dd/mm/aaaa, sí o no, verificación y tabla', () => {
    expect(page).toContain('<h2>Datos generales</h2>');
    expect(page).toContain('18/10/2026');
    expect(page).toContain('Sí');
    expect(page).toContain('No cumple');
    expect(page).toContain('Falta el guion');
    expect(page).toContain('Enviar cronograma');
    expect(page).toContain('20/10/2026');
    expect(page).toContain('Aprobó: Laura Prueba');
  });

  it('lo que escribió una persona nunca se vuelve HTML', () => {
    expect(page).not.toContain('<script>');
    expect(page).toContain('Cliente &lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('plantilla de salida HTML', () => {
  const context = templateContext(
    { document: DOCUMENT, company: COMPANY, facts: FACTS },
    DEFINITION,
    DATA,
  );

  it('llena las variables con los valores impresos y escapa lo que escribió una persona', () => {
    const body =
      '<p>{{cliente}} · {{fecha}} · {{formato.codigo}} · {{empresa.nit}}</p>{{#each compromisos}}<li>{{actividad}} {{fecha}}</li>{{/each}}';
    const html = renderHtmlTemplate(body, context);
    expect(html).toContain('Cliente &lt;script&gt;');
    expect(html).toContain('18/10/2026 · FT-COM-002 · 900000000-1');
    expect(html).toContain('<li>Enviar cronograma 20/10/2026</li>');
  });

  it('dice las variables que usa y rechaza una plantilla mal escrita', () => {
    const body =
      '{{cliente}} {{#each compromisos}}{{actividad}}{{/each}} {{#if acepta}}sí{{/if}} {{registro.codigo}}';
    expect(htmlTemplateVariables(body)).toEqual(['acepta', 'cliente', 'compromisos', 'registro']);
    expect(() => htmlTemplateVariables('{{#each compromisos}}')).toThrow(TemplateSyntaxError);
  });

  it('no permite ayudas que no sean las de Handlebars', () => {
    expect(() => renderHtmlTemplate('{{miAyuda cliente}}', context)).toThrow();
  });
});

describe('plantilla de salida en Word', () => {
  it('llena las variables y los bloques del Word', () => {
    const word = wordWith(
      'Cliente: {cliente}. {#compromisos}[{actividad}]{/compromisos} {registro.codigo}',
    );
    expect(docxTemplateVariables(word)).toEqual(['cliente', 'compromisos', 'registro']);
    const context = templateContext(
      { document: DOCUMENT, company: COMPANY, facts: FACTS },
      DEFINITION,
      DATA,
    );
    const text = wordText(fillDocxTemplate(word, context));
    expect(text).toContain('Cliente: Cliente &lt;script&gt;alert(1)&lt;/script&gt;.');
    expect(text).toContain('[Enviar cronograma]');
    expect(text).toContain('FT-COM-002-2026-0001');
  });

  it('rechaza un Word mal escrito o que no es un Word', () => {
    expect(() => docxTemplateVariables(wordWith('{cliente'))).toThrow(TemplateSyntaxError);
    expect(() => docxTemplateVariables(Buffer.from('no es un zip'))).toThrow(TemplateSyntaxError);
  });
});

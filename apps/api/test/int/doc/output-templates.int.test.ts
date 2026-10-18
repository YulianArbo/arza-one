import { Readable } from 'node:stream';

import { formPreviewResponseSchema, outputTemplateSchema } from '@arza/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { ConversionRejectedError } from '../../../src/modules/doc/infrastructure/gotenberg-converter.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { storage } from './support/file-scenario.js';
import { FormScenario, REQUIREMENTS_DATA } from './support/form-scenario.js';
import { wordTemplate, wordText } from './support/word-template.js';

// Plantillas de salida HTML y Word y PDF generado de los registros (B20, numeral 13.2): sintaxis y
// variables, vista previa con el encabezado institucional, inmutabilidad al publicarse, un registro
// llenado con una plantilla Word, un PDF rechazado y la huella del PDF guardado.

const scenario = new FormScenario('plantillas de salida');

beforeAll(async () => {
  await scenario.seed();
});

const HTML = { code: 'FT-COM-002', name: 'Acta de arranque', engine: 'html' };

describe('plantilla HTML', () => {
  it('revisa su sintaxis, anota sus variables y se ve con el encabezado y el pie', async () => {
    const designer = await scenario.quality('plantillas');
    const broken = await scenario.post('/v1/output-templates', designer.session, {
      ...HTML,
      body: '{{#each requisitos}}<p>{{requisito}}</p>',
    });
    expect(errorCode(broken)).toBe('DOC_OUTPUT_TEMPLATE_INVALID');
    const body = '<h1>{{cliente}}</h1>{{#each requisitos}}<p>{{requisito}}</p>{{/each}}';
    const id = await scenario.outputTemplate(designer, { ...HTML, body });
    const view = outputTemplateSchema.parse(
      (await scenario.get(`/v1/output-templates/${id}`, designer.session)).body,
    );
    expect(view.variables).toEqual(['cliente', 'requisitos']);
    const preview = formPreviewResponseSchema.parse(
      (await scenario.get(`/v1/output-templates/${id}/preview`, designer.session)).body,
    );
    expect(preview.html).toContain('Código: FT-COM-002');
    expect(preview.html).toContain('<h1>[cliente]</h1>');
    expect(preview.html).toContain('Copia no controlada cuando se imprime');
  });
});

describe('plantilla HTML publicada', () => {
  it('publicada, no cambia', async () => {
    const designer = await scenario.quality('publicada');
    const id = await scenario.outputTemplate(
      designer,
      { ...HTML, code: 'SALIDA-FIJA', body: '<p></p>' },
      true,
    );
    const edit = await scenario.patch(
      `/v1/output-templates/${id}`,
      designer.session,
      { name: 'Otro', body: '<p>x</p>' },
      2,
    );
    expect(errorCode(edit)).toBe('DOC_OUTPUT_TEMPLATE_NOT_EDITABLE');
  });

  it('un formato solo toma plantillas publicadas', async () => {
    const designer = await scenario.quality('plantilla-borrador');
    const draft = await scenario.outputTemplate(designer, {
      ...HTML,
      code: 'BORRADOR-SALIDA',
      body: '<p></p>',
    });
    const current = await scenario.publishedTemplate(designer, 'FT-TEC-001');
    const response = await scenario.post('/v1/form-templates', designer.session, {
      code: current.code,
      name: current.name,
      definition: current.definition,
      output_template_id: draft,
    });
    expect(errorCode(response)).toBe('DOC_FORM_TEMPLATE_NOT_EDITABLE');
  });
});

describe('plantilla Word', () => {
  it('el registro genera su documento con sus datos y Gotenberg lo convierte', async () => {
    const designer = await scenario.quality('plantilla-word');
    const word = wordTemplate('Acta de {cliente}: {decision}. {registro.codigo}');
    const output = await scenario.outputTemplate(
      designer,
      {
        code: 'FT-COM-002-WORD',
        name: 'Acta en Word',
        engine: 'docx',
        file_id: await scenario.sourceFile(designer, word),
      },
      true,
    );
    const current = await scenario.publishedTemplate(designer, 'FT-COM-002');
    await scenario.publishNewVersion(designer, current, {
      output_template_id: output,
      workflow_key: null,
    });
    const recordId = await scenario.fill(designer, 'FT-COM-002', REQUIREMENTS_DATA);
    expect((await scenario.recordStep(designer, recordId, 'submit')).status).toBe(204);
    let filled: Buffer = Buffer.alloc(0);
    const convertOffice = (source: { content: Buffer }) => {
      filled = source.content;
      return Promise.resolve(Buffer.from('%PDF-1.4\n%Word convertido\n%%EOF'));
    };
    await scenario.renderPdfs({ convertOffice });
    const record = await scenario.record(designer, recordId);
    expect(record.pdf_status).toBe('ready');
    expect(wordText(filled)).toContain(`Acta de Cliente Ficticio S.A.S.: Viable. ${record.code}`);
  });
});

describe('PDF generado', () => {
  it('si Gotenberg rechaza el documento, el registro queda con el PDF fallido', async () => {
    const author = await scenario.quality('rechazo');
    const recordId = await scenario.completedChecklist(author);
    const convertHtml = () => Promise.reject(new ConversionRejectedError(400));
    expect((await scenario.renderPdfs({ convertHtml })).failed).toBeGreaterThanOrEqual(1);
    expect((await scenario.record(author, recordId)).pdf_status).toBe('failed');
  });

  it('alterar el PDF guardado hace fallar la descarga', async () => {
    const author = await scenario.quality('huella');
    const recordId = await scenario.completedChecklist(author);
    await scenario.renderPdfs();
    const row = await scenario.inTenant((tx) =>
      tx.docFormRecord.findUniqueOrThrow({ where: { id: recordId }, include: { pdfFile: true } }),
    );
    const tampered = Buffer.from('%PDF-1.4\n%alterado\n%%EOF');
    const object = {
      key: row.pdfFile?.storageKey ?? '',
      contentType: 'application/pdf',
      sizeBytes: tampered.length,
    };
    await storage().put(object, Readable.from(tampered));
    const response = await scenario.post(`/v1/form-records/${recordId}/pdf`, author.session);
    expect(errorCode(response)).toBe('DOC_INTEGRITY_FAILED');
  });
});

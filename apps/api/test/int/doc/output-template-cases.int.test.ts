import {
  formPreviewResponseSchema,
  outputTemplateListResponseSchema,
  outputTemplateSchema,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { FormScenario } from './support/form-scenario.js';
import { wordTemplate } from './support/word-template.js';

// Casos de las plantillas de salida (B20, numeral 13.2): el contenido corresponde a su tipo, un
// código no cambia de tipo ni tiene dos borradores, la edición con una versión vieja se rechaza y
// la plantilla Word se ve con su archivo, sus variables y quién la publicó.

const scenario = new FormScenario('casos de plantillas de salida');

beforeAll(async () => {
  await scenario.seed();
});

const HTML = { name: 'Acta de prueba', engine: 'html', body: '<p>{{cliente}}</p>' };

async function wordFile(label: string): Promise<string> {
  const person = await scenario.quality(label);
  return scenario.sourceFile(person, wordTemplate('Acta de {cliente}'));
}

describe('el contenido corresponde al tipo de la plantilla', () => {
  it('al corregir, una HTML no recibe Word y una Word no recibe HTML', async () => {
    const designer = await scenario.quality('tipo-al-corregir');
    const html = await scenario.outputTemplate(designer, { ...HTML, code: 'TIPO-HTML' });
    const withWord = await scenario.patch(
      `/v1/output-templates/${html}`,
      designer.session,
      { name: 'Acta', body: null, file_id: uuidv7() },
      1,
    );
    expect(errorCode(withWord)).toBe('DOC_OUTPUT_TEMPLATE_INVALID');
    const file = await scenario.sourceFile(designer, wordTemplate('Acta de {cliente}'));
    const word = await scenario.outputTemplate(designer, {
      code: 'TIPO-WORD',
      name: 'Acta en Word',
      engine: 'docx',
      file_id: file,
    });
    const withHtml = await scenario.patch(
      `/v1/output-templates/${word}`,
      designer.session,
      { name: 'Acta en Word', body: '<p></p>', file_id: null },
      1,
    );
    expect(errorCode(withHtml)).toBe('DOC_OUTPUT_TEMPLATE_INVALID');
  });

  it('un Word subido por otra persona no sirve', async () => {
    const designer = await scenario.quality('word-ajeno');
    const response = await scenario.post('/v1/output-templates', designer.session, {
      code: 'WORD-AJENO',
      name: 'Acta en Word',
      engine: 'docx',
      file_id: await wordFile('sube-el-word'),
    });
    expect(errorCode(response)).toBe('DOC_OUTPUT_TEMPLATE_INVALID');
  });
});

describe('versiones de una plantilla', () => {
  it('un código no cambia de tipo ni tiene dos borradores', async () => {
    const designer = await scenario.quality('dos-borradores');
    await scenario.outputTemplate(designer, { ...HTML, code: 'UN-BORRADOR' });
    const otherEngine = await scenario.post('/v1/output-templates', designer.session, {
      code: 'UN-BORRADOR',
      name: 'Acta en Word',
      engine: 'docx',
      file_id: await scenario.sourceFile(designer, wordTemplate('{cliente}')),
    });
    expect(errorCode(otherEngine)).toBe('DOC_OUTPUT_TEMPLATE_INVALID');
    const second = await scenario.post('/v1/output-templates', designer.session, {
      ...HTML,
      code: 'UN-BORRADOR',
    });
    expect(errorCode(second)).toBe('DOC_OUTPUT_TEMPLATE_NOT_EDITABLE');
  });

  it('la edición con una versión vieja se rechaza; la que no existe responde que no está', async () => {
    const designer = await scenario.quality('version-vieja');
    const id = await scenario.outputTemplate(designer, { ...HTML, code: 'VERSION-VIEJA' });
    const stale = await scenario.patch(
      `/v1/output-templates/${id}`,
      designer.session,
      { name: 'Otro nombre', body: '<p></p>' },
      7,
    );
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
    const missing = await scenario.get(`/v1/output-templates/${uuidv7()}`, designer.session);
    expect(errorCode(missing)).toBe('DOC_OUTPUT_TEMPLATE_NOT_FOUND');
  });
});

describe('plantilla Word publicada', () => {
  it('se ve con su archivo, sus variables y quién la publicó', async () => {
    const designer = await scenario.quality('word-publicada');
    const file = await scenario.sourceFile(designer, wordTemplate('{cliente} y {decision}'));
    const id = await scenario.outputTemplate(
      designer,
      { code: 'WORD-PUBLICADA', name: 'Acta en Word', engine: 'docx', file_id: file },
      true,
    );
    const view = outputTemplateSchema.parse(
      (await scenario.get(`/v1/output-templates/${id}`, designer.session)).body,
    );
    expect(view.file?.id).toBe(file);
    expect(view.published_by?.id).toBe(designer.id);
    expect(view.actions).toEqual(['new_version']);
    const preview = formPreviewResponseSchema.parse(
      (await scenario.get(`/v1/output-templates/${id}/preview`, designer.session)).body,
    );
    expect(preview.html).toContain('Plantilla en Word. Variables que usa:');
    expect(preview.html).toContain('<li>{decision}</li>');
    const published = outputTemplateListResponseSchema.parse(
      (await scenario.get('/v1/output-templates?status=published', designer.session)).body,
    );
    expect(published.data.map((t) => t.id)).toContain(id);
    expect(published.data.every((t) => t.status === 'published')).toBe(true);
  });
});

import {
  formPreviewResponseSchema,
  formRecordListResponseSchema,
  formTemplateListResponseSchema,
  type FormTemplate,
} from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { FormScenario, REQUIREMENTS_DATA } from './support/form-scenario.js';

// Casos de los formatos y sus registros (B20, ficha 17.4): referencias que deben existir, un solo
// borrador por código, pasos que no corresponden al estado, ediciones con una versión vieja,
// la vista previa con su plantilla de salida y los filtros y páginas de los registros.

const scenario = new FormScenario('casos de formatos');

beforeAll(async () => {
  await scenario.seed();
});

/** El cuerpo de un formato nuevo con los campos del FT-COM-002 y el código dado. */
async function bodyFor(designer: Person, code: string): Promise<Record<string, unknown>> {
  const base: FormTemplate = await scenario.publishedTemplate(designer, 'FT-COM-002');
  return {
    code,
    name: base.name,
    definition: base.definition,
    layout: base.layout,
    workflow_key: null,
  };
}

async function draftOf(designer: Person, code: string): Promise<string> {
  const response = await scenario.post(
    '/v1/form-templates',
    designer.session,
    await bodyFor(designer, code),
  );
  expect(response.status, response.text).toBe(201);
  return (response.body as { id: string }).id;
}

function step(designer: Person, id: string, action: string, version: number) {
  return scenario
    .post(`/v1/form-templates/${id}/actions/${action}`, designer.session)
    .set('If-Match', `"${String(version)}"`);
}

describe('referencias de un formato', () => {
  it('solo la plataforma llena un formato desde una solicitud documental', async () => {
    const designer = await scenario.quality('desde-solicitud');
    const response = await scenario.post('/v1/form-templates', designer.session, {
      ...(await bodyFor(designer, 'FT-PRB-101')),
      entity_type: 'doc_change_request',
    });
    expect(errorCode(response)).toBe('DOC_FORM_TEMPLATE_NOT_EDITABLE');
  });

  it('el documento del Listado Maestro debe existir y la ficha lo muestra', async () => {
    const designer = await scenario.quality('con-documento');
    const missing = await scenario.post('/v1/form-templates', designer.session, {
      ...(await bodyFor(designer, 'FT-PRB-102')),
      document_id: uuidv7(),
    });
    expect(errorCode(missing)).toBe('DOC_FORM_TEMPLATE_NOT_EDITABLE');
    const documentId = await scenario.createDocument(designer);
    const created = await scenario.post('/v1/form-templates', designer.session, {
      ...(await bodyFor(designer, 'FT-PRB-102')),
      document_id: documentId,
    });
    expect(created.status, created.text).toBe(201);
    const view = await scenario.template(designer, (created.body as { id: string }).id);
    expect(view.document?.id).toBe(documentId);
  });
});

describe('estados de un formato', () => {
  it('un solo borrador; no se retira un borrador ni se publica lo publicado', async () => {
    const designer = await scenario.quality('estados-formato');
    const id = await draftOf(designer, 'FT-PRB-103');
    const second = await scenario.post(
      '/v1/form-templates',
      designer.session,
      await bodyFor(designer, 'FT-PRB-103'),
    );
    expect(errorCode(second)).toBe('DOC_FORM_TEMPLATE_NOT_EDITABLE');
    expect(errorCode(await step(designer, id, 'retire', 1))).toBe('DOC_FORM_TEMPLATE_NOT_EDITABLE');
    expect(errorCode(await step(designer, id, 'publish', 9))).toBe('VERSION_CONFLICT');
    expect((await step(designer, id, 'publish', 1)).status).toBe(204);
    const published = await scenario.template(designer, id);
    const again = await step(designer, id, 'publish', published.version);
    expect(errorCode(again)).toBe('DOC_FORM_TEMPLATE_NOT_EDITABLE');
    const missing = await scenario.get(`/v1/form-templates/${uuidv7()}`, designer.session);
    expect(errorCode(missing)).toBe('DOC_FORM_TEMPLATE_NOT_FOUND');
  });
});

describe('formatos para diligenciar y vista previa', () => {
  it('para diligenciar solo se ofrecen los publicados que llenan las personas', async () => {
    const designer = await scenario.quality('para-diligenciar');
    const response = await scenario.get('/v1/form-templates?fillable=true', designer.session);
    const { data } = formTemplateListResponseSchema.parse(response.body);
    expect(data.map((t) => t.code)).toContain('FT-COM-002');
    expect(data.map((t) => t.code)).not.toContain('FT-SGC-001');
    expect(data.every((t) => t.status === 'published' && t.fill_mode === 'manual')).toBe(true);
  });

  it('la vista previa usa su plantilla de salida HTML con valores de ejemplo', async () => {
    const designer = await scenario.quality('vista-con-salida');
    const output = await scenario.outputTemplate(
      designer,
      { code: 'SALIDA-VISTA', name: 'Salida', engine: 'html', body: '<p>Para {{cliente}}</p>' },
      true,
    );
    const response = await scenario.post('/v1/form-templates', designer.session, {
      ...(await bodyFor(designer, 'FT-PRB-104')),
      output_template_id: output,
    });
    const id = (response.body as { id: string }).id;
    const preview = formPreviewResponseSchema.parse(
      (await scenario.get(`/v1/form-templates/${id}/preview`, designer.session)).body,
    );
    expect(preview.html).toContain('<p>Para [cliente]</p>');
    expect(preview.html).toContain('Código: FT-PRB-104');
  });
});

describe('registros: versión vista, pasos y páginas', () => {
  it('la edición o la aprobación con una versión vieja se rechazan', async () => {
    const author = await scenario.quality('registro-version-vieja');
    const id = await scenario.fill(author, 'FT-COM-002', {});
    const stale = await scenario.patch(`/v1/form-records/${id}`, author.session, { data: {} }, 9);
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
    const approver = await scenario.quality('aprueba-borrador');
    const early = await scenario.recordStep(approver, id, 'approve');
    expect(errorCode(early)).toBe('DOC_TRANSITION_NOT_ALLOWED');
    const missing = await scenario.get(`/v1/form-records/${uuidv7()}`, author.session);
    expect(errorCode(missing)).toBe('DOC_FORM_RECORD_NOT_FOUND');
  });

  it('filtra por el registro al que pertenece y entrega por páginas', async () => {
    const reviewer = await scenario.quality('filtra-registros');
    const checklist = await scenario.completedChecklist(reviewer);
    const { entity } = await scenario.record(reviewer, checklist);
    const query = `entity_type=doc_version&entity_id=${entity?.id ?? ''}`;
    const filtered = formRecordListResponseSchema.parse(
      (await scenario.get(`/v1/form-records?${query}`, reviewer.session)).body,
    );
    expect(filtered.data.map((r) => r.id)).toEqual([checklist]);
    await scenario.fill(reviewer, 'FT-COM-002', REQUIREMENTS_DATA);
    const first = formRecordListResponseSchema.parse(
      (await scenario.get('/v1/form-records?limit=1', reviewer.session)).body,
    );
    expect(first.data).toHaveLength(1);
    expect(first.next_cursor).not.toBeNull();
    const next = formRecordListResponseSchema.parse(
      (
        await scenario.get(
          `/v1/form-records?limit=1&cursor=${first.next_cursor ?? ''}`,
          reviewer.session,
        )
      ).body,
    );
    expect(next.data[0]?.id).not.toBe(first.data[0]?.id);
  });
});

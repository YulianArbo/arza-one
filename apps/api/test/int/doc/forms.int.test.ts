import { formRecordListResponseSchema } from '@arza/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import {
  CHECKLIST_DATA,
  DELIVERY_DATA,
  FormScenario,
  REQUIREMENTS_DATA,
} from './support/form-scenario.js';

// Formatos digitales (B20, ficha 17.4): diligenciamiento con borrador, aprobación en el motor de
// flujos, PDF generado y el criterio del bloque «un registro conserva la versión del formato con
// que se creó».

const scenario = new FormScenario('formatos digitales');

beforeAll(async () => {
  await scenario.seed();
});

const EXTRA_SECTION = {
  key: 'extra',
  title: 'Sección nueva de la versión 2',
  fields: [{ key: 'presupuesto', label: 'Presupuesto', type: 'number', required: true }],
};

describe('criterio: un registro conserva la versión del formato con que se creó', () => {
  it('después de publicar la versión 2, el registro sigue con los campos de la 1', async () => {
    const author = await scenario.quality('diligencia-version');
    const designer = await scenario.quality('disena');
    const v1 = await scenario.formOfItsOwn(designer);
    const recordId = await scenario.fill(author, v1.code, REQUIREMENTS_DATA);
    const definition = { sections: [...v1.definition.sections, EXTRA_SECTION] };
    const v2 = await scenario.template(
      author,
      await scenario.publishNewVersion(designer, v1, { definition }),
    );
    expect(v2.form_version).toBe(v1.form_version + 1);
    expect((await scenario.template(author, v1.id)).status).toBe('retired');
    const kept = await scenario.record(author, recordId);
    expect(kept.template).toMatchObject({ id: v1.id, form_version: v1.form_version });
    expect(kept.definition).toEqual(v1.definition);
    // Se envía con lo que pedía la versión 1, sin el campo obligatorio nuevo de la 2.
    expect((await scenario.recordStep(author, recordId, 'submit')).status).toBe(204);
    const fresh = await scenario.fill(author, v1.code, REQUIREMENTS_DATA);
    expect((await scenario.record(author, fresh)).template.form_version).toBe(v2.form_version);
    expect(errorCode(await scenario.recordStep(author, fresh, 'submit'))).toBe('VALIDATION_FAILED');
  });
});

describe('criterio: la base de datos protege la versión', () => {
  it('no deja cambiar la versión de un registro ni el contenido de un formato publicado', async () => {
    const author = await scenario.quality('base-de-datos');
    const recordId = await scenario.fill(author, 'FT-TEC-001', {});
    const template = await scenario.publishedTemplate(author, 'FT-TEC-001');
    const changeVersion = scenario.inTenant((tx) =>
      tx.docFormRecord.update({ where: { id: recordId }, data: { templateVersion: 99 } }),
    );
    await expect(changeVersion).rejects.toThrow();
    const changeTemplate = scenario.inTenant((tx) =>
      tx.docFormTemplate.update({ where: { id: template.id }, data: { name: 'Otro nombre' } }),
    );
    await expect(changeTemplate).rejects.toThrow(/no se puede cambiar/u);
  });
});

describe('diligenciamiento con borrador', () => {
  it('el borrador acepta lo incompleto, pero no lo que no cumple su tipo', async () => {
    const author = await scenario.quality('borrador');
    const id = await scenario.fill(author, 'FT-COM-002', { cliente: 'Cliente Ficticio S.A.S.' });
    const record = await scenario.record(author, id);
    expect(record.code).toMatch(/^FT-COM-002-\d{4}-\d{4}$/u);
    expect(record).toMatchObject({ status: 'draft', actions: ['edit', 'submit'] });
    const wrong = await scenario.saveDraft(author, id, { fecha: '18/10/2026' });
    expect(errorCode(wrong)).toBe('VALIDATION_FAILED');
    expect(errorCode(await scenario.saveDraft(author, id, { otro: 'x' }))).toBe(
      'VALIDATION_FAILED',
    );
    const saved = await scenario.saveDraft(author, id, REQUIREMENTS_DATA);
    expect(saved.status, saved.text).toBe(204);
    expect((await scenario.record(author, id)).data).toMatchObject({ decision: 'Viable' });
  });

  it('solo quien lo diligencia guarda su borrador', async () => {
    const author = await scenario.quality('dueno');
    const other = await scenario.quality('otra-persona');
    const id = await scenario.fill(author, 'FT-COM-002', {});
    expect((await scenario.record(other, id)).actions).toEqual([]);
    const response = await scenario.saveDraft(other, id, {});
    expect(errorCode(response)).toBe('DOC_FORM_RECORD_NOT_EDITABLE');
  });
});

describe('flujo de aprobación: aprobar', () => {
  it('Dirección aprueba; el registro termina y su PDF queda listo para descargar', async () => {
    const author = await scenario.quality('aprobacion');
    const id = await scenario.fill(author, 'FT-COM-002', REQUIREMENTS_DATA);
    expect((await scenario.recordStep(author, id, 'submit')).status).toBe(204);
    const director = await scenario.director();
    const waiting = await scenario.record(director, id);
    expect(waiting).toMatchObject({ status: 'in_approval', step: 'Aprobación de Dirección' });
    expect(waiting.actions).toEqual(['approve', 'reject']);
    expect((await scenario.recordStep(director, id, 'approve')).status).toBe(204);
    const approved = await scenario.record(author, id);
    expect(approved).toMatchObject({ status: 'completed', pdf_status: 'pending' });
    expect(approved.approved_by?.id).toBe(director.id);
    expect((await scenario.renderPdfs()).records).toBeGreaterThanOrEqual(1);
    expect((await scenario.record(author, id)).actions).toEqual(['download']);
    const link = await scenario.post(`/v1/form-records/${id}/pdf`, author.session);
    expect(link.status, link.text).toBe(200);
  });

  it('se aprueba también desde «Mis tareas»', async () => {
    const author = await scenario.quality('mis-tareas');
    const id = await scenario.fill(author, 'FT-TEC-001', DELIVERY_DATA);
    await scenario.recordStep(author, id, 'submit');
    const task = await scenario.openTask(await scenario.instanceOf(id));
    const approved = await scenario.approveTask(await scenario.director(), task);
    expect(approved.status, approved.text).toBeLessThan(300);
    expect((await scenario.record(author, id)).status).toBe('completed');
  });
});

describe('flujo de aprobación: devolver y terminar sin flujo', () => {
  it('devolver exige el motivo y regresa el registro al borrador de quien lo diligenció', async () => {
    const author = await scenario.quality('devolucion');
    const id = await scenario.fill(author, 'FT-COM-002', REQUIREMENTS_DATA);
    await scenario.recordStep(author, id, 'submit');
    const director = await scenario.director();
    expect((await scenario.recordStep(director, id, 'reject')).status).toBeGreaterThanOrEqual(400);
    expect((await scenario.record(author, id)).status).toBe('in_approval');
    const note = 'Falta el presupuesto.';
    expect((await scenario.recordStep(director, id, 'reject', note)).status).toBe(204);
    const returned = await scenario.record(author, id);
    expect(returned).toMatchObject({ status: 'draft', return_note: note });
    expect((await scenario.recordStep(author, id, 'submit')).status).toBe(204);
    expect((await scenario.record(author, id)).status).toBe('in_approval');
  });

  it('sin flujo, el registro termina al enviarlo', async () => {
    const author = await scenario.quality('sin-flujo');
    const { versionId } = await scenario.versionInReview(author);
    const entity = { type: 'doc_version', id: versionId };
    const id = await scenario.fill(author, 'FT-SGC-002', CHECKLIST_DATA, entity);
    expect((await scenario.recordStep(author, id, 'submit')).status).toBe(204);
    expect((await scenario.record(author, id)).status).toBe('completed');
  });
});

describe('quien diligencia no aprueba', () => {
  it('ni desde la ficha ni desde «Mis tareas»; otra persona de Calidad sí', async () => {
    const designer = await scenario.quality('disena-calidad');
    const current = await scenario.publishedTemplate(designer, 'FT-TEC-001');
    await scenario.publishNewVersion(designer, current, {
      workflow_key: 'doc.form_record.quality',
    });
    const author = await scenario.quality('autor-calidad');
    const id = await scenario.fill(author, 'FT-TEC-001', DELIVERY_DATA);
    await scenario.recordStep(author, id, 'submit');
    expect((await scenario.record(author, id)).actions).toEqual([]);
    expect(errorCode(await scenario.recordStep(author, id, 'approve'))).toBe('DOC_SELF_APPROVAL');
    const task = await scenario.openTask(await scenario.instanceOf(id));
    expect(errorCode(await scenario.approveTask(author, task))).toBe('DOC_SELF_APPROVAL');
    const other = await scenario.quality('aprueba-calidad');
    expect((await scenario.recordStep(other, id, 'approve')).status).toBe(204);
  });
});

describe('listado de registros', () => {
  it('filtra por formato y por estado', async () => {
    const author = await scenario.quality('listado');
    const id = await scenario.fill(author, 'FT-COM-002', {});
    const query = '/v1/form-records?template_code=FT-COM-002&status=draft';
    const rows = formRecordListResponseSchema.parse(
      (await scenario.get(query, author.session)).body,
    ).data;
    expect(rows.map((row) => row.id)).toContain(id);
    expect(rows.every((row) => row.template.code === 'FT-COM-002')).toBe(true);
  });
});

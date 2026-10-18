import {
  createdResponseSchema,
  formRecordListResponseSchema,
  formTemplateListResponseSchema,
  outputTemplateListResponseSchema,
} from '@arza/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { organizationBody } from '../party/support/party-scenario.js';
import { FormScenario, REQUIREMENTS_DATA } from './support/form-scenario.js';

// Permiso denegado, registros confidenciales, aislamiento entre empresas y auditoría de los
// formatos digitales (B20, capítulo 21).

const scenario = new FormScenario('formatos acceso');

beforeAll(async () => {
  await scenario.seed();
});

async function partyOf(person: Person): Promise<string> {
  const response = await scenario.post('/v1/parties', person.session, organizationBody());
  expect(response.status, response.text).toBe(201);
  return createdResponseSchema.parse(response.body).id;
}

const KNOWLEDGE_DATA = {
  tipo_persona: 'Jurídica',
  nombre: 'Organización Ficticia S.A.S.',
  documento: 'NIT 900000000-0',
  origen_fondos: 'Recursos propios de la operación (dato ficticio).',
  nivel_riesgo: 'Bajo',
};

describe('permiso denegado', () => {
  it('sin rol o desde el portal no hay formatos, registros ni plantillas', async () => {
    const owner = await scenario.quality('dueno');
    const template = await scenario.publishedTemplate(owner, 'FT-COM-002');
    const recordId = await scenario.fill(owner, 'FT-COM-002', {});
    const people = [
      await scenario.person('sin-rol', []),
      await scenario.person('portal', ['CLIENTE_ADMIN'], { kind: 'portal' }),
    ];
    for (const person of people) {
      const denied = [
        await scenario.get('/v1/form-templates', person.session),
        await scenario.get(`/v1/form-templates/${template.id}`, person.session),
        await scenario.post('/v1/form-templates', person.session, {}),
        await scenario.get(`/v1/form-templates/${template.id}/preview`, person.session),
        await scenario.get('/v1/form-records', person.session),
        await scenario.get(`/v1/form-records/${recordId}`, person.session),
        await scenario.post('/v1/form-records', person.session, { template_id: template.id }),
        await scenario.post(`/v1/form-records/${recordId}/actions/submit`, person.session),
        await scenario.post(`/v1/form-records/${recordId}/pdf`, person.session),
        await scenario.get('/v1/output-templates', person.session),
        await scenario.post('/v1/output-templates', person.session, {}),
      ];
      for (const response of denied) expect(errorCode(response)).toBe('PERMISSION_DENIED');
    }
  });
});

describe('permiso denegado: quién diseña y quién aprueba', () => {
  it('solo Calidad diseña formatos y plantillas; Comercial diligencia pero no aprueba', async () => {
    const commercial = await scenario.person('comercial', ['COMERCIAL']);
    const template = await scenario.publishedTemplate(commercial, 'FT-COM-002');
    const create = await scenario.post('/v1/form-templates', commercial.session, {
      code: 'FT-COM-002',
    });
    expect(errorCode(create)).toBe('PERMISSION_DENIED');
    const publish = await scenario
      .post(`/v1/form-templates/${template.id}/actions/retire`, commercial.session)
      .set('If-Match', '"1"');
    expect(errorCode(publish)).toBe('PERMISSION_DENIED');
    expect(errorCode(await scenario.get('/v1/output-templates', commercial.session))).toBe(
      'PERMISSION_DENIED',
    );
    const id = await scenario.fill(commercial, 'FT-COM-002', REQUIREMENTS_DATA);
    expect((await scenario.recordStep(commercial, id, 'submit')).status).toBe(204);
    const other = await scenario.person('comercial-2', ['COMERCIAL']);
    expect(errorCode(await scenario.recordStep(other, id, 'approve'))).toBe('PERMISSION_DENIED');
  });
});

describe('permiso denegado: Dirección y Colaborador', () => {
  it('Dirección aprueba registros pero no los diligencia', async () => {
    const director = await scenario.director();
    const template = await scenario.publishedTemplate(director, 'FT-COM-002');
    const response = await scenario.post('/v1/form-records', director.session, {
      template_id: template.id,
    });
    expect(errorCode(response)).toBe('PERMISSION_DENIED');
  });

  it('el Colaborador diligencia y ve solo los registros que él diligenció', async () => {
    await scenario.fill(await scenario.quality('ajeno'), 'FT-COM-002', {});
    const collaborator = await scenario.person('colaborador', ['COLABORADOR']);
    const own = await scenario.fill(collaborator, 'FT-COM-002', {});
    const list = await scenario.get('/v1/form-records', collaborator.session);
    const ids = formRecordListResponseSchema.parse(list.body).data.map((row) => row.id);
    expect(ids).toEqual([own]);
  });
});

describe('registros confidenciales (FT-COM-003)', () => {
  it('los ven quien lo diligenció, quien aprueba y quien gestiona terceros; no los demás', async () => {
    const commercial = await scenario.person('comercial-confidencial', ['COMERCIAL']);
    const party = await partyOf(commercial);
    const id = await scenario.fill(commercial, 'FT-COM-003', KNOWLEDGE_DATA, {
      type: 'party',
      id: party,
    });
    const record = await scenario.record(commercial, id);
    expect(record.classification).toBe('confidential');
    expect(record.entity?.type).toBe('party');
    await scenario.record(await scenario.quality('calidad-confidencial'), id);
    await scenario.record(await scenario.director(), id);
    const technical = await scenario.person('lider-tecnico', ['LIDER_TECNICO']);
    expect(errorCode(await scenario.get(`/v1/form-records/${id}`, technical.session))).toBe(
      'DOC_FORM_RECORD_NOT_FOUND',
    );
    const list = await scenario.get('/v1/form-records', technical.session);
    expect(formRecordListResponseSchema.parse(list.body).data.map((r) => r.id)).not.toContain(id);
  });

  it('la auditoría guarda que se diligenció, nunca los valores', async () => {
    const commercial = await scenario.person('comercial-auditoria', ['COMERCIAL']);
    const party = await partyOf(commercial);
    const id = await scenario.fill(commercial, 'FT-COM-003', KNOWLEDGE_DATA, {
      type: 'party',
      id: party,
    });
    const events = await scenario.inTenant((tx) =>
      tx.auditEvent.findMany({ where: { entityId: id } }),
    );
    expect(events.map((event) => event.action)).toContain('doc.form_record.create');
    expect(JSON.stringify(events.map((event) => event.changes))).not.toContain('Recursos propios');
  });
});

describe('aislamiento entre empresas', () => {
  it('la empresa B no ve ni toca los registros de la A', async () => {
    const author = await scenario.quality('autor-a');
    const id = await scenario.fill(author, 'FT-COM-002', REQUIREMENTS_DATA);
    const outsider = await scenario.quality('calidad-b', scenario.otherTenant.id);
    const list = await scenario.get('/v1/form-records', outsider.session);
    expect(formRecordListResponseSchema.parse(list.body).data.map((r) => r.id)).not.toContain(id);
    expect(errorCode(await scenario.get(`/v1/form-records/${id}`, outsider.session))).toBe(
      'DOC_FORM_RECORD_NOT_FOUND',
    );
    const patch = await scenario.patch(`/v1/form-records/${id}`, outsider.session, { data: {} }, 1);
    expect(errorCode(patch)).toBe('DOC_FORM_RECORD_NOT_FOUND');
    const pdf = await scenario.post(`/v1/form-records/${id}/pdf`, outsider.session);
    expect(errorCode(pdf)).toBe('DOC_FORM_RECORD_NOT_FOUND');
  });
});

describe('aislamiento entre empresas: formatos y plantillas', () => {
  it('cada empresa tiene sus formatos y plantillas; B no diligencia un formato de A', async () => {
    const inA = await scenario.publishedTemplate(await scenario.quality('ve-a'), 'FT-COM-002');
    const outsider = await scenario.quality('ve-b', scenario.otherTenant.id);
    const templates = await scenario.get('/v1/form-templates', outsider.session);
    expect(
      formTemplateListResponseSchema.parse(templates.body).data.map((t) => t.id),
    ).not.toContain(inA.id);
    expect(errorCode(await scenario.get(`/v1/form-templates/${inA.id}`, outsider.session))).toBe(
      'DOC_FORM_TEMPLATE_NOT_FOUND',
    );
    const fill = await scenario.post('/v1/form-records', outsider.session, { template_id: inA.id });
    expect(errorCode(fill)).toBe('DOC_FORM_TEMPLATE_NOT_FOUND');
    const outputsA = await scenario.get(
      '/v1/output-templates',
      (await scenario.quality('salida-a')).session,
    );
    const outputsB = await scenario.get('/v1/output-templates', outsider.session);
    const idsA = outputTemplateListResponseSchema.parse(outputsA.body).data.map((t) => t.id);
    const idsB = outputTemplateListResponseSchema.parse(outputsB.body).data.map((t) => t.id);
    expect(idsA.some((id) => idsB.includes(id))).toBe(false);
  });
});

describe('aislamiento entre empresas: consecutivos', () => {
  it('cada empresa lleva su propio consecutivo de registros', async () => {
    const personB = await scenario.quality('consecutivo-b', scenario.otherTenant.id);
    await scenario.fill(await scenario.quality('consecutivo-a'), 'FT-TEC-001', {});
    const inB = await scenario.fill(personB, 'FT-TEC-001', {});
    expect((await scenario.record(personB, inB)).code).toMatch(/^FT-TEC-001-\d{4}-0001$/u);
  });
});

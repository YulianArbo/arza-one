import { formRecordSchema } from '@arza/contracts';
import type request from 'supertest';
import { expect } from 'vitest';

import { renderTenantPdfs, seedDocForms } from '../../../../src/modules/doc/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { apiDatabase } from '../../support/integration-database.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { samplePdf, storage } from '../../doc/support/file-scenario.js';
import { created, quality, seeded } from './doc-sgc-steps.js';

// Llamadas del recorrido de escrituras (B11) para los formatos digitales (B20): formatos,
// registros diligenciados con sus pasos y su PDF, y plantillas de salida.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

const DEFINITION = {
  sections: [
    {
      key: 'general',
      title: 'Datos generales',
      fields: [{ key: 'asunto', label: 'Asunto', type: 'text', required: true }],
    },
  ],
};

async function withForms(s: AccessScenario): Promise<Person> {
  await seeded(s);
  await seedDocForms(apiDatabase(), [s.tenant.id], systemClock);
  return quality(s, 'formatos-recorrido');
}

let codeNumber = Math.floor(Math.random() * 900) + 100;

/** Un formato nuevo en borrador, sin aprobación. */
async function draftTemplate(s: AccessScenario, person: Person): Promise<string> {
  codeNumber += 1;
  const body = {
    code: `FT-REC-${String(codeNumber)}`,
    name: 'Formato del recorrido',
    definition: DEFINITION,
  };
  return created(s.post('/v1/form-templates', person.session, body));
}

async function publishedTemplate(s: AccessScenario, person: Person): Promise<string> {
  const id = await draftTemplate(s, person);
  const response = await s
    .post(`/v1/form-templates/${id}/actions/publish`, person.session)
    .set('If-Match', '"1"');
  expect(response.status, response.text).toBe(204);
  return id;
}

async function draftRecord(s: AccessScenario, person: Person, data: object = { asunto: 'Prueba' }) {
  const templateId = await publishedTemplate(s, person);
  return created(s.post('/v1/form-records', person.session, { template_id: templateId, data }));
}

async function recordVersion(s: AccessScenario, person: Person, id: string): Promise<number> {
  const response = await s.get(`/v1/form-records/${id}`, person.session);
  return formRecordSchema.parse(response.body).version;
}

async function draftOutput(s: AccessScenario, person: Person): Promise<string> {
  codeNumber += 1;
  return created(
    s.post('/v1/output-templates', person.session, {
      code: `SALIDA-${String(codeNumber)}`,
      name: 'Plantilla del recorrido',
      engine: 'html',
      body: '<p>{{asunto}}</p>',
    }),
  );
}

export const DOC_FORM_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/form-templates': async (s) => {
    const person = await withForms(s);
    codeNumber += 1;
    const body = {
      code: `FT-REC-${String(codeNumber)}`,
      name: 'Formato nuevo',
      definition: DEFINITION,
    };
    return { test: s.post('/v1/form-templates', person.session, body) };
  },
  'PATCH /v1/form-templates/{id}': async (s) => {
    const person = await withForms(s);
    const id = await draftTemplate(s, person);
    const body = { name: 'Formato corregido', definition: DEFINITION };
    return { test: s.patch(`/v1/form-templates/${id}`, person.session, body, 1) };
  },
  'POST /v1/form-templates/{id}/actions/publish': async (s) => {
    const person = await withForms(s);
    const id = await draftTemplate(s, person);
    return {
      test: s
        .post(`/v1/form-templates/${id}/actions/publish`, person.session)
        .set('If-Match', '"1"'),
    };
  },
  'POST /v1/form-templates/{id}/actions/retire': async (s) => {
    const person = await withForms(s);
    const id = await publishedTemplate(s, person);
    return {
      test: s
        .post(`/v1/form-templates/${id}/actions/retire`, person.session)
        .set('If-Match', '"2"'),
    };
  },
  'POST /v1/form-records': async (s) => {
    const person = await withForms(s);
    const templateId = await publishedTemplate(s, person);
    return {
      test: s.post('/v1/form-records', person.session, { template_id: templateId, data: {} }),
    };
  },
  'PATCH /v1/form-records/{id}': async (s) => {
    const person = await withForms(s);
    const id = await draftRecord(s, person, {});
    const version = await recordVersion(s, person, id);
    return {
      test: s.patch(
        `/v1/form-records/${id}`,
        person.session,
        { data: { asunto: 'Otro' } },
        version,
      ),
    };
  },
  'POST /v1/form-records/{id}/actions/{step}': async (s) => {
    const person = await withForms(s);
    const id = await draftRecord(s, person);
    const version = await recordVersion(s, person, id);
    return {
      test: s
        .post(`/v1/form-records/${id}/actions/submit`, person.session, {})
        .set('If-Match', `"${String(version)}"`),
    };
  },
  'POST /v1/form-records/{id}/pdf': async (s) => {
    const person = await withForms(s);
    const id = await draftRecord(s, person);
    const version = await recordVersion(s, person, id);
    await s
      .post(`/v1/form-records/${id}/actions/submit`, person.session, {})
      .set('If-Match', `"${String(version)}"`);
    const pdf = () => Promise.resolve(samplePdf('Formato del recorrido'));
    await renderTenantPdfs(
      {
        database: apiDatabase(),
        clock: s.clock,
        storage: storage(),
        convertHtml: pdf,
        convertOffice: pdf,
        stamp: (content) => Promise.resolve(content),
      },
      s.tenant.id,
    );
    return { test: s.post(`/v1/form-records/${id}/pdf`, person.session) };
  },
  'POST /v1/output-templates': async (s) => {
    const person = await withForms(s);
    codeNumber += 1;
    const body = {
      code: `SALIDA-${String(codeNumber)}`,
      name: 'Plantilla nueva',
      engine: 'html',
      body: '<p></p>',
    };
    return { test: s.post('/v1/output-templates', person.session, body) };
  },
  'PATCH /v1/output-templates/{id}': async (s) => {
    const person = await withForms(s);
    const id = await draftOutput(s, person);
    const body = { name: 'Plantilla corregida', body: '<p>{{asunto}}</p>', file_id: null };
    return { test: s.patch(`/v1/output-templates/${id}`, person.session, body, 1) };
  },
  'POST /v1/output-templates/{id}/actions/publish': async (s) => {
    const person = await withForms(s);
    const id = await draftOutput(s, person);
    return {
      test: s
        .post(`/v1/output-templates/${id}/actions/publish`, person.session)
        .set('If-Match', '"1"'),
    };
  },
};

import {
  kbArticleDetailSchema,
  pqrsfDetailSchema,
  pqrsfListResponseSchema,
  publicPqrsfFiledSchema,
  surveyListResponseSchema,
} from '@arza/contracts';
import request from 'supertest';

import { surveyTokenHash } from '../../../../src/modules/service/application/survey-public.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp, tenantScope } from '../../iam/support/iam-fixtures.js';
import { created, put, versioned, type PendingRequest } from './contract-steps.js';
import type { RouteCall } from './project-route-calls.js';

// Llamadas del recorrido de escrituras (B11) para las PQRSF, las encuestas, la base de conocimiento y
// el sitio público de Servicio al cliente (B29). Cada una prepara lo suyo por la API, a nombre de
// personas de Servicio al cliente; la encuesta usa un enlace con una llave conocida.

const FORM = {
  type: 'complaint',
  name: 'Ana Pérez',
  email: 'ana.recorrido@ejemplo.test',
  phone: null,
  subject: 'Demora en la entrega',
  description: 'El entregable del portal llegó dos semanas tarde.',
  accepts_privacy: true,
};

const ARTICLE = {
  title: 'Cómo restablecer su contraseña',
  summary: 'Pasos para recuperar el acceso a ARZA ONE si olvidó su contraseña.',
  body: 'Abra la página de ingreso y elija «¿Olvidó su contraseña?».',
  category: 'platform',
  audience: 'internal',
};

function publicCall(s: AccessScenario, path: string, body: object): request.Test {
  return request(s.app.getHttpServer())
    .post(`/v1/public/${path}`)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('User-Agent', 'Navegador de prueba')
    .send(body);
}

interface Desk {
  readonly drafter: Person;
  readonly approver: Person;
  readonly id: string;
  readonly code: string;
}

/** Una PQRSF radicada en el sitio público y su identificador en la bandeja. */
async function filed(s: AccessScenario): Promise<Desk> {
  const drafter = await s.person('servicio-pqrsf-recorrido', ['SERVICIO']);
  const approver = await s.person('servicio-aprueba-pqrsf-recorrido', ['SERVICIO']);
  const response = await publicCall(s, 'pqrsf', FORM);
  const { code } = publicPqrsfFiledSchema.parse(response.body);
  const list = pqrsfListResponseSchema.parse(
    (await s.get(`/v1/pqrsf?q=${code}`, drafter.session)).body,
  );
  return { drafter, approver, id: list.data[0]?.id ?? '', code };
}

async function step(
  s: AccessScenario,
  d: Desk,
  action: string,
  body: object = {},
  person: Person = d.drafter,
): Promise<PendingRequest> {
  const detail = pqrsfDetailSchema.parse(
    (await s.get(`/v1/pqrsf/${d.id}`, d.drafter.session)).body,
  );
  const path = `/v1/pqrsf/${d.id}/actions/${action}`;
  return { test: versioned(s.post(path, person.session, body), detail.version) };
}

/** Avanza la PQRSF por los pasos dados, uno tras otro. */
async function through(s: AccessScenario, d: Desk, steps: [string, object][]): Promise<void> {
  for (const [action, body] of steps) await (await step(s, d, action, body)).test;
}

const CLASSIFIED = (d: Desk): [string, object] => [
  'classify',
  { type: 'complaint', assignee_id: d.drafter.id },
];
const DRAFTED: [string, object] = [
  'draft',
  { response: 'Ajustamos el cronograma de entregas.', well_founded: false },
];

async function submitted(s: AccessScenario): Promise<Desk> {
  const d = await filed(s);
  await through(s, d, [CLASSIFIED(d), DRAFTED, ['respond', {}]]);
  return d;
}

async function article(s: AccessScenario): Promise<{ agent: Person; id: string }> {
  const agent = await s.person('servicio-kb-recorrido', ['SERVICIO']);
  const id = await created(s.post('/v1/kb-articles', agent.session, ARTICLE));
  return { agent, id };
}

async function articleStep(s: AccessScenario, action: string): Promise<PendingRequest> {
  const { agent, id } = await article(s);
  const detail = kbArticleDetailSchema.parse(
    (await s.get(`/v1/kb-articles/${id}`, agent.session)).body,
  );
  const path = `/v1/kb-articles/${id}/actions/${action}`;
  return { test: versioned(s.post(path, agent.session, {}), detail.version) };
}

/** Un tiquete resuelto con su encuesta enviada con una llave conocida. */
async function surveyLink(s: AccessScenario): Promise<string> {
  const agent = await s.person('servicio-encuesta-recorrido', ['SERVICIO']);
  const ticket = await created(
    s.post('/v1/tickets', agent.session, {
      subject: 'No carga el reporte',
      description: 'El reporte queda en blanco.',
      category: 'incident',
      priority: 'low',
      requester_email: 'cliente.recorrido@ejemplo.test',
    }),
  );
  const run = async (action: string, body: object, version: number) =>
    versioned(s.post(`/v1/tickets/${ticket}/actions/${action}`, agent.session, body), version);
  await run('assign', { assignee_id: agent.id }, 1);
  await run('start', {}, 2);
  await run('resolve', { resolution: 'Se reconstruyó el índice.' }, 3);
  const token = `llave-del-recorrido-${crypto.randomUUID()}`;
  const at = new Date();
  await tenantScope(
    s.db,
    s.tenant.id,
  )((tx) =>
    tx.svcSurveyResponse.updateMany({
      where: { entityId: ticket },
      data: {
        tokenHash: surveyTokenHash(token),
        sentAt: at,
        expiresAt: new Date(at.getTime() + 86_400_000),
        mailPending: false,
      },
    }),
  );
  return token;
}

export const CARE_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/public/pqrsf': (s) => Promise.resolve({ test: publicCall(s, 'pqrsf', FORM) }),
  'POST /v1/public/pqrsf/status': async (s) => {
    const d = await filed(s);
    return { test: publicCall(s, 'pqrsf/status', { code: d.code, email: FORM.email }) };
  },
  'POST /v1/public/surveys/view': async (s) => ({
    test: publicCall(s, 'surveys/view', { token: await surveyLink(s) }),
  }),
  'POST /v1/public/surveys/answer': async (s) => ({
    test: publicCall(s, 'surveys/answer', {
      token: await surveyLink(s),
      score: 9,
      satisfaction: 5,
      comment: null,
    }),
  }),
  'POST /v1/pqrsf': async (s) => {
    const agent = await s.person('servicio-pqrsf-recorrido', ['SERVICIO']);
    const body = {
      channel: 'phone',
      type: 'suggestion',
      requester_name: 'Luis Rojas',
      requester_phone: '3001234567',
      subject: 'Horario de atención',
      description: 'Sugiere atender también los sábados en la mañana.',
    };
    return { test: s.post('/v1/pqrsf', agent.session, body) };
  },
  'POST /v1/pqrsf/{id}/actions/classify': async (s) => {
    const d = await filed(s);
    const [action, body] = CLASSIFIED(d);
    return step(s, d, action, body);
  },
  'POST /v1/pqrsf/{id}/actions/assign': async (s) => {
    const d = await filed(s);
    await through(s, d, [CLASSIFIED(d)]);
    return step(s, d, 'assign', { assignee_id: d.approver.id });
  },
  'POST /v1/pqrsf/{id}/actions/draft': async (s) => {
    const d = await filed(s);
    await through(s, d, [CLASSIFIED(d)]);
    return step(s, d, DRAFTED[0], DRAFTED[1]);
  },
  'POST /v1/pqrsf/{id}/actions/respond': async (s) => {
    const d = await filed(s);
    await through(s, d, [CLASSIFIED(d), DRAFTED]);
    return step(s, d, 'respond');
  },
  'POST /v1/pqrsf/{id}/actions/approve': async (s) => {
    const d = await submitted(s);
    return step(s, d, 'approve', {}, d.approver);
  },
  'POST /v1/pqrsf/{id}/actions/return': async (s) => {
    const d = await submitted(s);
    return step(s, d, 'return', { reason: 'Falta la fecha.' }, d.approver);
  },
  'POST /v1/pqrsf/{id}/actions/close': async (s) => {
    const d = await submitted(s);
    await (
      await step(s, d, 'approve', {}, d.approver)
    ).test;
    return step(s, d, 'close');
  },
  'PUT /v1/surveys/{id}': async (s) => {
    const agent = await s.person('servicio-encuesta-recorrido', ['SERVICIO']);
    const list = surveyListResponseSchema.parse((await s.get('/v1/surveys', agent.session)).body);
    const survey = list.data[0];
    const body = {
      name: survey?.name ?? '',
      recommend_question: survey?.recommend_question ?? '',
      satisfaction_question: survey?.satisfaction_question ?? '',
      comment_question: survey?.comment_question ?? '',
      is_active: true,
    };
    return {
      test: versioned(put(s, `/v1/surveys/${survey?.id ?? ''}`, agent, body), survey?.version ?? 0),
    };
  },
  'POST /v1/kb-articles': async (s) => {
    const agent = await s.person('servicio-kb-recorrido', ['SERVICIO']);
    return { test: s.post('/v1/kb-articles', agent.session, ARTICLE) };
  },
  'PUT /v1/kb-articles/{id}': async (s) => {
    const { agent, id } = await article(s);
    const body = { ...ARTICLE, title: 'Cómo cambiar su contraseña' };
    return { test: versioned(put(s, `/v1/kb-articles/${id}`, agent, body), 1) };
  },
  'POST /v1/kb-articles/{id}/actions/publish': (s) => articleStep(s, 'publish'),
  'POST /v1/kb-articles/{id}/actions/archive': (s) => articleStep(s, 'archive'),
};

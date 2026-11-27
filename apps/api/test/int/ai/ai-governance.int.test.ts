import {
  AI_ERROR_CODES,
  aiPromptListResponseSchema,
  aiRequestListResponseSchema,
  aiStatusSchema,
} from '@arza/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import {
  ASSESSMENT,
  ask,
  auditActions,
  createdId,
  enable,
  putAs,
  useCaseVersion,
} from './support/ai-fixture.js';

// Gobierno del asistente (B47): permisos de cada ruta (decisión 6), activación con evaluación de
// impacto (decisión 7), instrucciones aprobadas por otra persona, límite diario (decisión 8),
// registro de usos aislado por empresa y auditado (decisión 5).

const scenario = new AccessScenario('asistente gobierno');
let officer: Person;
let admin: Person;
let quality: Person;
let worker: Person;

beforeAll(async () => {
  officer = await scenario.person('oficial-gobierno', ['OFICIAL_DATOS']);
  admin = await scenario.person('admin-gobierno', ['ADMIN_PLATAFORMA']);
  quality = await scenario.person('calidad-gobierno', ['CALIDAD']);
  worker = await scenario.person('colaborador-gobierno', ['COLABORADOR']);
});

describe('permisos de cada ruta', () => {
  it('niega a quien no tiene el permiso', async () => {
    const client = await scenario.person('cliente-gobierno', ['CLIENTE_USUARIO']);
    expect((await scenario.get('/v1/ai/status', client.session)).status).toBe(403);
    expect(
      (await scenario.post('/v1/ai/search', client.session, { question: 'Hola mundo' })).status,
    ).toBe(403);
    expect((await scenario.get('/v1/ai/use-cases', worker.session)).status).toBe(403);
    expect((await scenario.get('/v1/ai/use-cases', quality.session)).status).toBe(403);
    expect((await scenario.get('/v1/ai/requests', worker.session)).status).toBe(403);
    expect((await scenario.get('/v1/ai/requests', quality.session)).status).toBe(403);
    expect((await scenario.get('/v1/ai/prompts', officer.session)).status).toBe(403);
    const body = { use_case: 'doc_summary', body: 'Resuma en tres viñetas cortas, por favor.' };
    expect((await scenario.post('/v1/ai/prompts', worker.session, body)).status).toBe(403);
    const save = { enabled: false, version: 0 };
    expect((await putAs(scenario, '/v1/ai/use-cases/doc_search', admin, save)).status).toBe(403);
  });

  it('un uso apagado no responde y el estado dice cuáles están activos', async () => {
    const off = await scenario.post('/v1/ai/search', worker.session, { question: 'Hola mundo' });
    expect(off.status).toBe(409);
    expect(errorCode(off)).toBe(AI_ERROR_CODES.useCaseDisabled);
    const status = aiStatusSchema.parse((await scenario.get('/v1/ai/status', worker.session)).body);
    expect(status).toMatchObject({ provider: 'rehearsal', daily_limit: 50 });
    expect(status.enabled_use_cases).not.toContain('doc_search');
  });
});

describe('activación de los usos (decisión 7)', () => {
  it('exige la evaluación de impacto, controla la versión y queda auditada', async () => {
    const path = '/v1/ai/use-cases/ticket_reply';
    const version = await useCaseVersion(scenario, officer, 'ticket_reply');
    const missing = await putAs(scenario, path, officer, { enabled: true, version });
    expect(missing.status).toBe(422);
    const stale = await putAs(scenario, path, officer, {
      enabled: true,
      ...ASSESSMENT,
      version: 9,
    });
    expect(stale.status).toBe(409);
    await enable(scenario, officer, ['ticket_reply']);
    const row = await scenario.inTenant((tx) =>
      tx.aiUseCase.findFirstOrThrow({ where: { useCase: 'ticket_reply' } }),
    );
    expect(row).toMatchObject({ enabled: true, assessmentReference: 'EIPD-IA-001' });
    expect(await auditActions(scenario, row.id)).toContain('ai.use_case.update');
    const unknown = await putAs(scenario, '/v1/ai/use-cases/otro', officer, {
      enabled: false,
      version: 0,
    });
    expect(unknown.status).toBe(404);
  });
});

describe('instrucciones del asistente', () => {
  it('una instrucción la aprueba otra persona y pasa a regir', async () => {
    const body = {
      use_case: 'doc_search',
      body: 'Responda en un solo párrafo y cite siempre el código.',
    };
    const first = createdId(await scenario.post('/v1/ai/prompts', admin.session, body));
    const self = await scenario.post(`/v1/ai/prompts/${first}/approve`, admin.session);
    expect(self.status).toBe(403);
    expect(errorCode(self)).toBe(AI_ERROR_CODES.selfApproval);
    expect((await scenario.post(`/v1/ai/prompts/${first}/approve`, quality.session)).status).toBe(
      204,
    );
    expect((await scenario.post(`/v1/ai/prompts/${first}/approve`, quality.session)).status).toBe(
      409,
    );
    const second = createdId(await scenario.post('/v1/ai/prompts', quality.session, body));
    expect((await scenario.post(`/v1/ai/prompts/${second}/approve`, admin.session)).status).toBe(
      204,
    );
    const list = aiPromptListResponseSchema.parse(
      (await scenario.get('/v1/ai/prompts', admin.session)).body,
    );
    const versions = list.data.filter((prompt) => prompt.use_case === 'doc_search');
    expect(versions.map((prompt) => [prompt.version, prompt.status])).toEqual([
      [2, 'approved'],
      [1, 'retired'],
    ]);
    expect(list.defaults).toHaveLength(7);
    await enable(scenario, officer, ['doc_search']);
    const answer = await ask(scenario, worker, 'Pregunta sin documentos que la respondan');
    const used = await scenario.inTenant((tx) =>
      tx.aiRequest.findUniqueOrThrow({ where: { id: answer.request_id } }),
    );
    expect(used.promptVersion).toBe(2);
    expect(await auditActions(scenario, second)).toEqual(
      expect.arrayContaining(['ai.prompt.create', 'ai.prompt.approve']),
    );
  });
});

describe('registro de usos', () => {
  it('cada persona decide una vez sobre su propuesta; nadie más', async () => {
    await enable(scenario, officer, ['doc_search']);
    const answer = await ask(scenario, worker, 'Otra pregunta sin documentos');
    const path = `/v1/ai/requests/${answer.request_id}/review`;
    // Sin fuentes no hay propuesta que usar.
    expect((await scenario.post(path, worker.session, { decision: 'accepted' })).status).toBe(404);
    const stranger = await scenario.person('ajeno-registro', ['COLABORADOR'], {
      tenantId: scenario.otherTenant.id,
    });
    expect((await scenario.post(path, stranger.session, { decision: 'accepted' })).status).toBe(
      404,
    );
  });

  it('el registro es de cada empresa, no guarda texto y su consulta se audita', async () => {
    await enable(scenario, officer, ['doc_search']);
    const answer = await ask(scenario, worker, 'Pregunta para el registro de usos');
    const auditor = await scenario.person('auditor-registro', ['AUDITOR']);
    const response = await scenario.get('/v1/ai/requests?use_case=doc_search', auditor.session);
    expect(response.status, response.text).toBe(200);
    const list = aiRequestListResponseSchema.parse(response.body);
    expect(list.data.find((row) => row.id === answer.request_id)).toMatchObject({
      user: { id: worker.id },
      outcome: 'no_sources',
      provider: 'rehearsal',
    });
    expect(JSON.stringify(list)).not.toContain('Pregunta para el registro de usos');
    expect(await auditActions(scenario, scenario.tenant.id)).toContain('ai.request.read');
    const other = await scenario.person('oficial-otra', ['OFICIAL_DATOS'], {
      tenantId: scenario.otherTenant.id,
    });
    const theirs = aiRequestListResponseSchema.parse(
      (await scenario.get('/v1/ai/requests', other.session)).body,
    );
    expect(theirs.data.map((row) => row.id)).not.toContain(answer.request_id);
  });
});

describe('límite diario', () => {
  it('al llegar al límite del día no responde más (decisión 8)', async () => {
    await enable(scenario, officer, ['doc_search']);
    const busy = await scenario.person('limite-gobierno', ['COLABORADOR']);
    await scenario.inTenant((tx) =>
      tx.aiRequest.createMany({
        data: Array.from({ length: 50 }, () => ({
          tenantId: scenario.tenant.id,
          userId: busy.id,
          useCase: 'doc_search',
          provider: 'rehearsal',
          model: 'ensayo-local',
          inputClass: 'none',
          outcome: 'no_sources',
        })),
      }),
    );
    const response = await scenario.post('/v1/ai/search', busy.session, { question: 'Una más' });
    expect(response.status).toBe(429);
    expect(errorCode(response)).toBe(AI_ERROR_CODES.dailyLimit);
  });
});

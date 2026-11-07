import { describe, expect, it } from 'vitest';

import { CareScenario } from './support/care-scenario.js';

// Permiso denegado y aislamiento entre empresas de las PQRSF y las encuestas del B29. Comercial y
// Calidad leen pero no tramitan; el Líder técnico responde pero no aprueba ni administra encuestas;
// el colaborador y el Contador no entran; Servicio de otra empresa no ve ni toca nada. Datos
// ficticios.

const scenario = new CareScenario('pqrsf y encuestas: acceso');

describe('permiso denegado: PQRSF', () => {
  it('Comercial lee pero no clasifica; el colaborador y el Contador no entran', async () => {
    const agent = await scenario.agent();
    const sales = await scenario.sales();
    const colleague = await scenario.person('colaborador', ['COLABORADOR']);
    const accountant = await scenario.person('contador', ['CONTADOR']);
    const filed = await scenario.filePublic();
    const id = await scenario.pqrsfId(agent, filed.code);
    expect((await scenario.get(`/v1/pqrsf/${id}`, sales.session)).status).toBe(200);
    const classify = await scenario.pqrsfStep(sales, id, 'classify', {
      type: 'complaint',
      assignee_id: agent.id,
    });
    expect(classify.status).toBe(403);
    expect((await scenario.get('/v1/pqrsf', colleague.session)).status).toBe(403);
    expect((await scenario.get(`/v1/pqrsf/${id}`, accountant.session)).status).toBe(403);
    const create = await scenario.post('/v1/pqrsf', sales.session, {});
    expect(create.status).toBe(403);
  });

  it('el Líder técnico redacta la respuesta pero no la aprueba', async () => {
    const tech = await scenario.person('lider-tecnico', ['LIDER_TECNICO']);
    const drafter = await scenario.agent();
    const id = await scenario.submitted(drafter);
    expect((await scenario.pqrsfOf(tech, id)).can.approve).toBe(false);
    expect((await scenario.pqrsfStep(tech, id, 'approve')).status).toBe(403);
    expect((await scenario.pqrsfStep(tech, id, 'return', { reason: 'No.' })).status).toBe(403);
  });
});

describe('permiso denegado: encuestas', () => {
  it('solo Servicio cambia la encuesta y los resultados no son para el colaborador', async () => {
    const tech = await scenario.person('lider-tecnico-encuesta', ['LIDER_TECNICO']);
    const colleague = await scenario.person('colaborador-encuesta', ['COLABORADOR']);
    const list = await scenario.get('/v1/surveys', tech.session);
    expect(list.body).toMatchObject({ can_manage: false });
    const put = await scenario.put(`/v1/surveys/${crypto.randomUUID()}`, tech, {}, 1);
    expect(put.status).toBe(403);
    expect((await scenario.get('/v1/survey-responses', colleague.session)).status).toBe(403);
    expect((await scenario.get('/v1/survey-responses', tech.session)).status).toBe(200);
  });
});

describe('aislamiento entre empresas', () => {
  it('Servicio de otra empresa no ve ni toca las PQRSF de esta', async () => {
    const agent = await scenario.agent();
    const stranger = await scenario.agent(scenario.otherTenant.id);
    const id = await scenario.classified(agent);
    expect((await scenario.get(`/v1/pqrsf/${id}`, stranger.session)).status).toBe(404);
    expect((await scenario.pqrsfInbox(stranger)).map((row) => row.id)).not.toContain(id);
    const { version } = await scenario.pqrsfOf(agent, id);
    const draft = await scenario.action(`/v1/pqrsf/${id}/actions/draft`, stranger, version, {
      response: 'Respuesta de otra empresa.',
      well_founded: false,
    });
    expect(draft.status).toBe(404);
    expect((await scenario.pqrsfOf(agent, id)).status).toBe('classified');
  });

  it('los resultados de las encuestas son solo de la empresa', async () => {
    const agent = await scenario.agent();
    const stranger = await scenario.agent(scenario.otherTenant.id);
    const id = await scenario.working(agent, { requester_email: 'cliente@ejemplo.test' });
    await scenario.stepOk(agent, id, 'resolve', { resolution: 'Se reinició el servicio.' });
    await scenario.inTenant((tx) =>
      tx.svcSurveyResponse.updateMany({
        where: { entityId: id },
        data: {
          tokenHash: `prueba-${id}`,
          sentAt: scenario.clock.now(),
          expiresAt: scenario.clock.now(),
          score: 9,
          satisfaction: 5,
          answeredAt: scenario.clock.now(),
          mailPending: false,
        },
      }),
    );
    const own = await scenario.get('/v1/survey-responses', agent.session);
    const theirs = await scenario.get('/v1/survey-responses', stranger.session);
    expect(JSON.stringify(own.body)).toContain(id);
    expect(JSON.stringify(theirs.body)).not.toContain(id);
  });
});

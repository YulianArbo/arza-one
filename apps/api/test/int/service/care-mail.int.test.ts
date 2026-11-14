import { surveyListResponseSchema, surveyResultsSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { tenantsWithCareWork } from '../../../src/modules/service/index.js';
import type { Person } from '../iam/support/access-scenario.js';
import { CareScenario, surveyToken, uniqueEmail } from './support/care-scenario.js';

// Lo que hace el worker del B29 (ficha 17.9): el acuse y la respuesta de la PQRSF por correo, los
// avisos de «por vencer» y vencida, y la encuesta al resolver un tiquete con su NPS. Es el único
// archivo que corre el worker de PQRSF y encuestas: así ningún otro se lleva sus correos. Datos
// ficticios.

const scenario = new CareScenario('pqrsf y encuestas: worker');
const DAY = 24 * 60;

async function resolvedTicket(agent: Person, overrides: object = {}): Promise<string> {
  const id = await scenario.working(agent, overrides);
  await scenario.stepOk(agent, id, 'resolve', { resolution: 'Se reconstruyó el índice.' });
  return id;
}

async function surveyMailFor(email: string): Promise<string> {
  await scenario.careWork();
  const mail = scenario.mailsTo(email).at(-1);
  if (mail === undefined) throw new Error(`No llegó la encuesta a ${email}`);
  return surveyToken(mail);
}

describe('correos de la PQRSF', () => {
  it('el acuse lleva el radicado y la fecha límite; la respuesta aprobada sale después', async () => {
    const drafter = await scenario.agent();
    const approver = await scenario.agent();
    const filed = await scenario.filePublic();
    await scenario.careWork();
    const [ack] = scenario.mailsTo(filed.email);
    expect(ack?.subject).toContain(filed.code);
    const [year, month, day] = filed.due_on.split('-');
    expect(ack?.text).toContain(`${String(day)}/${String(month)}/${String(year)}`);
    expect(ack?.text).toContain('/pqrsf/consulta');
    const id = await scenario.pqrsfId(drafter, filed.code);
    await scenario.pqrsfStepOk(drafter, id, 'classify', {
      type: 'complaint',
      assignee_id: drafter.id,
    });
    await scenario.pqrsfStepOk(drafter, id, 'draft', {
      response: 'Ajustamos el cronograma de entregas.',
      well_founded: false,
    });
    await scenario.pqrsfStepOk(drafter, id, 'respond');
    await scenario.pqrsfStepOk(approver, id, 'approve');
    await scenario.careWork();
    const response = scenario.mailsTo(filed.email).at(-1);
    expect(response?.subject).toContain('Respuesta');
    expect(response?.text).toContain('Ajustamos el cronograma de entregas.');
    const pqrsf = await scenario.pqrsfOf(drafter, id);
    expect(pqrsf.ack_sent_at).not.toBeNull();
    expect(pqrsf.response_sent_at).not.toBeNull();
    const status = await scenario.public('pqrsf/status', { code: filed.code, email: filed.email });
    expect(status.body).toMatchObject({ status: 'responded' });
    expect((status.body as { response: string }).response).toContain('cronograma');
    expect(await scenario.auditActions(id)).toContain('service.pqrsf.mail');
  });
});

describe('correos de la PQRSF', () => {
  it('avisa al responsable y al líder cuando está por vencer y cuando vence', async () => {
    let agent = await scenario.agent();
    const id = await scenario.classified(agent);
    const { due_on: dueOn } = await scenario.pqrsfOf(agent, id);
    const now = scenario.clock.now().getTime();
    const days = Math.ceil((Date.parse(`${dueOn}T12:00:00-05:00`) - now) / 86_400_000);
    scenario.advance((days - 1) * DAY);
    expect(await tenantsWithCareWork(scenario.careDeps(), scenario.clock.now())).toContain(
      scenario.tenant.id,
    );
    await scenario.careWork();
    // Días después, la sesión de antes ya venció: vuelve a entrar.
    agent = await scenario.refresh(agent);
    expect((await scenario.pqrsfOf(agent, id)).due_state).toBe('at_risk');
    scenario.advance(3 * DAY);
    await scenario.careWork();
    agent = await scenario.refresh(agent);
    expect((await scenario.pqrsfOf(agent, id)).due_state).toBe('overdue');
    expect(await scenario.auditActions(id)).toEqual(
      expect.arrayContaining(['service.pqrsf.warn', 'service.pqrsf.breach']),
    );
    await scenario.dispatchNotices();
    const notices = await scenario.noticesFor(agent.id, 'svc_pqrsf_update');
    expect(notices.join(' ')).toContain('venció');
  });
});

describe('encuesta al resolver (decisiones 8 y 9)', () => {
  it('llega al correo de quien reporta, se responde una vez y alimenta el NPS', async () => {
    const agent = await scenario.agent();
    const email = uniqueEmail('cliente');
    const id = await resolvedTicket(agent, { requester_email: email });
    expect((await scenario.ticketOf(agent, id)).survey).toMatchObject({ state: 'sent' });
    const token = await surveyMailFor(email);
    const view = await scenario.public('surveys/view', { token });
    expect(view.status, view.text).toBe(200);
    expect(view.body).toMatchObject({ state: 'open' });
    const answer = { token, score: 10, satisfaction: 5, comment: 'Muy buena atención.' };
    expect((await scenario.public('surveys/answer', answer)).status).toBe(204);
    expect((await scenario.public('surveys/answer', answer)).status).toBe(409);
    expect((await scenario.public('surveys/view', { token })).body).toMatchObject({
      state: 'answered',
    });
    expect((await scenario.ticketOf(agent, id)).survey).toMatchObject({
      state: 'answered',
      score: 10,
    });
    const results = surveyResultsSchema.parse(
      (await scenario.get('/v1/survey-responses', agent.session)).body,
    );
    expect(results.data.map((row) => row.ticket.id)).toContain(id);
    expect(results.summary.promoters).toBeGreaterThan(0);
    expect(results.summary.nps).not.toBeNull();
  });
});

describe('encuesta al resolver (decisiones 8 y 9)', () => {
  it('al reabrir y resolver de nuevo, el enlace anterior deja de servir', async () => {
    const agent = await scenario.agent();
    const email = uniqueEmail('reabre');
    const id = await resolvedTicket(agent, { requester_email: email });
    const first = await surveyMailFor(email);
    await scenario.stepOk(agent, id, 'reopen', { reason: 'Volvió a fallar.' });
    await scenario.stepOk(agent, id, 'resolve', { resolution: 'Se cambió el servidor.' });
    const second = await surveyMailFor(email);
    expect(second).not.toBe(first);
    expect((await scenario.public('surveys/view', { token: first })).status).toBe(404);
    expect((await scenario.public('surveys/view', { token: second })).status).toBe(200);
  });
});

describe('encuesta al resolver (decisiones 8 y 9)', () => {
  it('sin correo queda «sin correo»; un enlace falso no existe; el enlace vence', async () => {
    const agent = await scenario.agent();
    const id = await resolvedTicket(agent);
    expect((await scenario.ticketOf(agent, id)).survey).toMatchObject({ state: 'no_recipient' });
    const fake = await scenario.public('surveys/view', { token: 'x'.repeat(43) });
    expect(fake.status).toBe(404);
    const fakeAnswer = await scenario.public('surveys/answer', {
      token: 'x'.repeat(43),
      score: 5,
      satisfaction: 3,
    });
    expect(fakeAnswer.status).toBe(404);
    const email = uniqueEmail('vence');
    await resolvedTicket(agent, { requester_email: email });
    const token = await surveyMailFor(email);
    scenario.advance(31 * DAY);
    expect((await scenario.public('surveys/view', { token })).body).toMatchObject({
      state: 'expired',
    });
    const late = await scenario.public('surveys/answer', { token, score: 5, satisfaction: 3 });
    expect(late.status).toBe(409);
  });
});

describe('encuesta al resolver (decisiones 8 y 9)', () => {
  it('una encuesta apagada no se envía', async () => {
    const agent = await scenario.agent();
    const list = surveyListResponseSchema.parse(
      (await scenario.get('/v1/surveys', agent.session)).body,
    );
    const survey = list.data[0];
    if (survey === undefined) throw new Error('Sin encuesta');
    const { id, version } = survey;
    const texts = {
      name: survey.name,
      recommend_question: survey.recommend_question,
      satisfaction_question: survey.satisfaction_question,
      comment_question: survey.comment_question,
    };
    const off = await scenario.put(
      `/v1/surveys/${id}`,
      agent,
      { ...texts, is_active: false },
      version,
    );
    expect(off.status, off.text).toBe(204);
    const stale = await scenario.put(
      `/v1/surveys/${id}`,
      agent,
      { ...texts, is_active: true },
      version,
    );
    expect(stale.status).toBe(409);
    const ticket = await resolvedTicket(agent, { requester_email: uniqueEmail('apagada') });
    expect((await scenario.ticketOf(agent, ticket)).survey).toBeNull();
    const on = await scenario.put(
      `/v1/surveys/${id}`,
      agent,
      { ...texts, is_active: true },
      version + 1,
    );
    expect(on.status, on.text).toBe(204);
  });
});

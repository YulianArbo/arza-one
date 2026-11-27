import { AI_ERROR_CODES } from '@arza/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { CareScenario } from '../service/support/care-scenario.js';
import { answerOf, assist, enable, requestRow } from './support/ai-fixture.js';

// Asistente en la mesa de ayuda (B47, ficha 17.21): resumen de la conversación de un tiquete,
// borradores de respuesta y clasificación sugerida de tiquetes y PQRSF. La IA propone; la persona
// decide en la pantalla del registro. Las PQRSF sobre datos personales nunca van al asistente.

const scenario = new CareScenario('asistente servicio');
let agent: Person;

beforeAll(async () => {
  agent = await scenario.agent();
  const officer = await scenario.person('oficial-servicio', ['OFICIAL_DATOS']);
  await enable(scenario, officer, [
    'ticket_summary',
    'ticket_reply',
    'ticket_classify',
    'pqrsf_reply',
    'pqrsf_classify',
  ]);
});

async function pqrsf(overrides: Record<string, unknown> = {}): Promise<string> {
  return scenario.create('/v1/pqrsf', agent, {
    channel: 'phone',
    type: 'petition',
    requester_name: 'Persona de prueba',
    requester_phone: '3001234567',
    subject: 'Queja por la demora',
    description: 'Presento una queja: la entrega llegó tarde y nadie me avisó.',
    ...overrides,
  });
}

describe('tiquetes', () => {
  it('resume la conversación, redacta y sugiere la clasificación del tiquete', async () => {
    const id = await scenario.ticket(agent, {
      description: 'La plataforma está caída y no funciona. Escriba a ana@cliente.co.',
    });
    const message = { body: 'Revisamos el servidor y reiniciamos el servicio.' };
    expect((await scenario.post(`/v1/tickets/${id}/messages`, agent.session, message)).status).toBe(
      201,
    );
    const summary = answerOf(await assist(scenario, agent, 'ticket_summary', id));
    expect(summary.sources).toEqual([expect.objectContaining({ kind: 'ticket', id })]);
    const reply = answerOf(await assist(scenario, agent, 'ticket_reply', id));
    expect(reply.text).toContain('[complete la respuesta]');
    const classes = answerOf(await assist(scenario, agent, 'ticket_classify', id));
    expect(classes.suggestion).toMatchObject({ ticket_category: 'incident' });
    const row = await requestRow(scenario, summary.request_id);
    expect(row).toMatchObject({
      targetKind: 'ticket',
      targetId: id,
      inputClass: 'confidential',
      outcome: 'answered',
    });
    expect(row.redactions).toBeGreaterThanOrEqual(1);
  });

  it('quien no ve el tiquete no obtiene nada de él, tampoco desde otra empresa', async () => {
    const id = await scenario.ticket(agent);
    const worker = await scenario.person('colaborador-tiquete', ['COLABORADOR']);
    expect((await assist(scenario, worker, 'ticket_summary', id)).status).toBe(404);
    const stranger = await scenario.agent(scenario.otherTenant.id);
    const officer = await scenario.person('oficial-ajeno', ['OFICIAL_DATOS'], {
      tenantId: scenario.otherTenant.id,
    });
    await enable(scenario, officer, ['ticket_summary']);
    expect((await assist(scenario, stranger, 'ticket_summary', id)).status).toBe(404);
  });
});

describe('PQRSF', () => {
  it('sugiere el tipo y redacta la respuesta de una PQRSF', async () => {
    const id = await pqrsf();
    const classes = answerOf(await assist(scenario, agent, 'pqrsf_classify', id));
    expect(classes.suggestion).toMatchObject({ pqrsf_type: 'complaint', ticket_category: null });
    const reply = answerOf(await assist(scenario, agent, 'pqrsf_reply', id));
    expect(reply.sources).toEqual([expect.objectContaining({ kind: 'pqrsf', id })]);
  });

  it('una PQRSF sobre datos personales nunca va al asistente', async () => {
    const id = await pqrsf();
    await scenario.pqrsfStepOk(agent, id, 'classify', {
      type: 'petition',
      privacy_kind: 'inquiry',
      assignee_id: agent.id,
    });
    const response = await assist(scenario, agent, 'pqrsf_reply', id);
    expect(response.status, response.text).toBe(422);
    expect(errorCode(response)).toBe(AI_ERROR_CODES.sourceExcluded);
  });

  it('quien no ve las PQRSF no obtiene nada de ellas', async () => {
    const id = await pqrsf();
    const worker = await scenario.person('colaborador-pqrsf', ['COLABORADOR']);
    expect((await assist(scenario, worker, 'pqrsf_classify', id)).status).toBe(404);
  });
});

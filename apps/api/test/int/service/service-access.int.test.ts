import { describe, expect, it } from 'vitest';

import { ServiceScenario } from './support/service-scenario.js';

// Permiso denegado y aislamiento entre empresas del B28 (decisión 9). Un colaborador registra y ve
// solo lo suyo; Comercial solo lee; el Contador no entra a la mesa de ayuda; el Líder técnico atiende
// pero no cambia los acuerdos de tiempo ni decide compensaciones. Una persona de Servicio de otra
// empresa no ve ni toca nada. Datos ficticios.

const scenario = new ServiceScenario('mesa de ayuda: acceso');

describe('permiso denegado', () => {
  it('un colaborador registra y ve solo lo suyo, y no lo atiende', async () => {
    const agent = await scenario.agent();
    const colleague = await scenario.person('colaborador', ['COLABORADOR']);
    const other = await scenario.person('colaborador-2', ['COLABORADOR']);
    const own = await scenario.ticket(colleague, { category: 'platform', priority: 'low' });
    const agents = await scenario.ticket(agent);
    expect((await scenario.ticketOf(colleague, own)).requester?.id).toBe(colleague.id);
    expect((await scenario.get(`/v1/tickets/${agents}`, colleague.session)).status).toBe(404);
    expect((await scenario.get(`/v1/tickets/${own}`, other.session)).status).toBe(404);
    expect((await scenario.inbox(colleague)).map((row) => row.id)).toEqual([own]);
    const assign = await scenario.step(colleague, own, 'assign', { assignee_id: agent.id });
    expect(assign.status).toBe(403);
    expect((await scenario.step(colleague, own, 'start', {}, agent)).status).toBe(403);
    expect((await scenario.get('/v1/warranties', colleague.session)).status).toBe(403);
  });
});

describe('permiso denegado: lectura y sin acceso', () => {
  it('Comercial solo lee y el Contador no entra', async () => {
    const agent = await scenario.agent();
    const sales = await scenario.sales();
    const accountant = await scenario.person('contador', ['CONTADOR']);
    const id = await scenario.ticket(agent);
    expect((await scenario.get(`/v1/tickets/${id}`, sales.session)).status).toBe(200);
    const create = await scenario.post('/v1/tickets', sales.session, scenario.ticketBody());
    expect(create.status).toBe(403);
    expect((await scenario.write(sales, id, { body: 'Hola.' })).status).toBe(403);
    expect((await scenario.get('/v1/tickets', accountant.session)).status).toBe(403);
  });
});

describe('permiso denegado: Líder técnico', () => {
  it('el Líder técnico atiende, pero no cambia acuerdos ni decide compensaciones', async () => {
    const agent = await scenario.agent();
    const tech = await scenario.person('lider-tecnico', ['LIDER_TECNICO']);
    const id = await scenario.ticket(agent);
    expect((await scenario.step(tech, id, 'assign', { assignee_id: tech.id })).status).toBe(204);
    const policies = await scenario.get('/v1/sla-policies', tech.session);
    expect(policies.body).toMatchObject({ can_manage: false });
    const body = { first_response_hours: 1, resolution_hours: 2, calendar: 'business' };
    const put = await scenario.put(`/v1/sla-policies/${crypto.randomUUID()}`, tech, body, 1);
    expect(put.status).toBe(403);
    const decide = await scenario.action(
      `/v1/tickets/${id}/compensations/${crypto.randomUUID()}/actions/decide`,
      tech,
      1,
      { approve: true },
    );
    expect(decide.status).toBe(403);
  });
});

describe('aislamiento entre empresas', () => {
  it('Servicio de otra empresa no ve ni toca los tiquetes de esta', async () => {
    const agent = await scenario.agent();
    const stranger = await scenario.agent(scenario.otherTenant.id);
    const id = await scenario.working(agent);
    const base = `/v1/tickets/${id}`;
    for (const path of [base, `${base}/messages`, `${base}/compensations`]) {
      expect((await scenario.get(path, stranger.session)).status, path).toBe(404);
    }
    expect((await scenario.inbox(stranger)).map((row) => row.id)).not.toContain(id);
    expect((await scenario.write(stranger, id, { body: 'Mensaje ajeno.' })).status).toBe(404);
    const { version } = await scenario.ticketOf(agent, id);
    const resolve = await scenario.action(`${base}/actions/resolve`, stranger, version, {
      resolution: 'Ajeno.',
    });
    expect(resolve.status).toBe(404);
    expect((await scenario.ticketOf(agent, id)).status).toBe('in_progress');
  });
});

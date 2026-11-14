import {
  compensationListResponseSchema,
  slaPolicyListResponseSchema,
  ticketListResponseSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { ServiceScenario } from './support/service-scenario.js';

// La mesa de ayuda del B28: registrar con cliente, escalar por niveles, la conversación con notas
// internas, el tiquete crítico (PT-TEC-003), las compensaciones con aprobación de otra persona y los
// acuerdos de tiempo. Datos ficticios.

const scenario = new ServiceScenario('mesa de ayuda: tiquetes');

it('valida la versión y el estado al editar un tiquete sin cambiar su prioridad', async () => {
  const agent = await scenario.agent();
  const id = await scenario.working(agent);
  const original = await scenario.ticketOf(agent, id);
  const path = `/v1/tickets/${id}`;
  const body = {
    ...scenario.ticketBody(),
    priority: original.priority,
    subject: 'Detalle corregido',
  };
  expect((await scenario.put(path, agent, body, original.version + 1)).status).toBe(409);
  expect((await scenario.put(path, agent, body, original.version)).status).toBe(204);
  expect((await scenario.ticketOf(agent, id)).resolution_due_at).toBe(original.resolution_due_at);
  await scenario.stepOk(agent, id, 'resolve', { resolution: 'Se corrigió la falla.' });
  const resolved = await scenario.ticketOf(agent, id);
  expect((await scenario.put(path, agent, body, resolved.version)).status).toBe(409);
  await scenario.stepOk(agent, id, 'close');
  const closed = await scenario.ticketOf(agent, id);
  expect((await scenario.put(path, agent, body, closed.version)).status).toBe(409);
});

it('pagina por cursor los tiquetes que coinciden con el texto y la prioridad', async () => {
  const agent = await scenario.agent();
  const first = await scenario.ticket(agent, {
    subject: 'Impresora de recepción',
    priority: 'high',
  });
  const second = await scenario.ticket(agent, { subject: 'Impresora de bodega', priority: 'high' });
  await scenario.ticket(agent, { subject: 'Impresora de ventas', priority: 'low' });
  await scenario.ticket(agent, { subject: 'Pantalla de recepción', priority: 'medium' });
  const path = '/v1/tickets?q=impresora&priority=high&limit=1';
  const page = ticketListResponseSchema.parse((await scenario.get(path, agent.session)).body);
  expect(page.data).toHaveLength(1);
  const cursor = page.next_cursor;
  if (cursor === null) throw new Error('Falta el cursor de la segunda página');
  expect(cursor).toBe(page.data[0]?.id);
  const next = ticketListResponseSchema.parse(
    (await scenario.get(`${path}&cursor=${cursor}`, agent.session)).body,
  );
  expect(next.data).toHaveLength(1);
  expect(new Set([...page.data, ...next.data].map((ticket) => ticket.id))).toEqual(
    new Set([first, second]),
  );
  expect(next.next_cursor).toBeNull();
});

it('rechaza una asignación repetida y conserva el estado al reasignar', async () => {
  const agent = await scenario.agent();
  const tech = await scenario.person('lider-tecnico', ['LIDER_TECNICO']);
  const id = await scenario.ticket(agent);
  await scenario.stepOk(agent, id, 'assign', { assignee_id: agent.id });
  expect((await scenario.step(agent, id, 'assign', { assignee_id: agent.id })).status).toBe(409);
  await scenario.stepOk(agent, id, 'start');
  const before = await scenario.ticketOf(agent, id);
  await scenario.stepOk(agent, id, 'assign', { assignee_id: tech.id });
  expect(await scenario.ticketOf(agent, id)).toMatchObject({
    status: before.status,
    assignee: { id: tech.id },
  });
});

describe('registro', () => {
  it('a nombre de un cliente, con código y vencimientos', async () => {
    const agent = await scenario.agent();
    const partyId = await scenario.clientParty();
    const id = await scenario.ticket(agent, {
      priority: 'high',
      party_id: partyId,
      requester_name: 'Ana Gómez',
      channel: 'phone',
    });
    const ticket = await scenario.ticketOf(agent, id);
    expect(ticket.code).toMatch(/^TIQ-\d{4}-\d{4}$/u);
    expect(ticket).toMatchObject({
      status: 'new',
      level: 1,
      channel: 'phone',
      party: { id: partyId },
      requester_name: 'Ana Gómez',
      sla: { calendar: 'business', first_response_hours: 4, resolution_hours: 16 },
    });
    expect(ticket.response_due_at).not.toBeNull();
    expect((await scenario.inbox(agent, '?view=unassigned')).map((row) => row.id)).toContain(id);
  });

  it('rechaza un proyecto que no existe y un cliente inválido', async () => {
    const agent = await scenario.agent();
    const project = await scenario.post('/v1/tickets', agent.session, {
      ...scenario.ticketBody(),
      project_id: crypto.randomUUID(),
    });
    expect(project.status).toBe(422);
    const party = await scenario.post('/v1/tickets', agent.session, {
      ...scenario.ticketBody(),
      party_id: crypto.randomUUID(),
    });
    expect(party.status).toBe(422);
  });
});

describe('tiquete crítico (PT-TEC-003)', () => {
  it('un tiquete crítico avisa de inmediato al Líder técnico y a la Dirección', async () => {
    const agent = await scenario.agent();
    const tech = await scenario.person('lider-tecnico', ['LIDER_TECNICO']);
    const director = await scenario.person('direccion', ['DIRECCION']);
    const id = await scenario.ticket(agent, { priority: 'critical' });
    await scenario.dispatchNotices();
    for (const person of [tech, director]) {
      expect((await scenario.noticesFor(person.id, 'svc_ticket_alert', id)).join(' ')).toContain(
        'PT-TEC-003',
      );
    }
    expect(await scenario.noticesFor(agent.id, 'svc_ticket_alert', id)).toHaveLength(0);
  });
});

describe('asignación y escalamiento', () => {
  it('sube un nivel cada vez hasta el tercero y avisa a quien lo recibe', async () => {
    const agent = await scenario.agent();
    const tech = await scenario.person('lider-tecnico', ['LIDER_TECNICO']);
    const id = await scenario.ticket(agent);
    const reason = 'Requiere revisar la base de datos.';
    await scenario.stepOk(agent, id, 'escalate', { assignee_id: tech.id, reason });
    await scenario.stepOk(agent, id, 'escalate', { assignee_id: agent.id, reason });
    const top = await scenario.ticketOf(agent, id);
    expect(top).toMatchObject({ level: 3, status: 'assigned', assignee: { id: agent.id } });
    const again = await scenario.step(agent, id, 'escalate', { assignee_id: tech.id, reason });
    expect(again.status).toBe(409);
    await scenario.dispatchNotices();
    expect((await scenario.noticesFor(tech.id, 'svc_ticket_update')).join(' ')).toContain(
      'escalaron',
    );
    const notes = (await scenario.messages(agent, id)).filter((message) => message.is_internal);
    expect(notes.map((note) => note.body)).toContain(`Escalado al nivel 2: ${reason}`);
  });

  it('solo se asigna a Servicio al cliente o al Líder técnico', async () => {
    const agent = await scenario.agent();
    const sales = await scenario.sales();
    const id = await scenario.ticket(agent);
    const response = await scenario.step(agent, id, 'assign', { assignee_id: sales.id });
    expect(response.status).toBe(422);
  });

  it('un paso que el estado no admite es rechazado', async () => {
    const agent = await scenario.agent();
    const id = await scenario.ticket(agent);
    expect((await scenario.step(agent, id, 'resolve', { resolution: 'Listo.' })).status).toBe(409);
    expect((await scenario.step(agent, id, 'close')).status).toBe(409);
  });
});

describe('conversación', () => {
  it('el primer mensaje público es la primera respuesta; la nota interna no', async () => {
    const agent = await scenario.agent();
    const id = await scenario.ticket(agent);
    const note = await scenario.write(agent, id, {
      body: 'Revisar los registros.',
      is_internal: true,
    });
    expect(note.status, note.text).toBe(201);
    expect((await scenario.ticketOf(agent, id)).first_response_at).toBeNull();
    expect((await scenario.write(agent, id, { body: 'Ya lo estamos revisando.' })).status).toBe(
      201,
    );
    expect((await scenario.ticketOf(agent, id)).first_response_at).not.toBeNull();
  });

  it('quien pidió el tiquete no ve las notas internas y escribe como el cliente', async () => {
    const agent = await scenario.agent();
    const colleague = await scenario.person('colaborador', ['COLABORADOR']);
    const id = await scenario.ticket(colleague, { category: 'platform', priority: 'low' });
    await scenario.write(agent, id, { body: 'Nota solo del equipo.', is_internal: true });
    await scenario.write(agent, id, { body: '¿Desde qué navegador entra?' });
    const reply = await scenario.write(colleague, id, { body: 'Desde Chrome.', is_internal: true });
    expect(reply.status).toBe(201);
    const seen = await scenario.messages(colleague, id);
    expect(seen.map((message) => message.body)).toEqual([
      '¿Desde qué navegador entra?',
      'Desde Chrome.',
    ]);
    expect(seen[1]).toMatchObject({ is_internal: false, from_client: true });
    expect((await scenario.messages(agent, id)).some((message) => message.is_internal)).toBe(true);
  });
});

async function compensations(person: Person, ticketId: string) {
  const response = await scenario.get(`/v1/tickets/${ticketId}/compensations`, person.session);
  expect(response.status, response.text).toBe(200);
  return compensationListResponseSchema.parse(response.body).data;
}

describe('compensaciones (RE-SAC-001)', () => {
  it('otra persona la decide; quien la propuso no puede', async () => {
    const agent = await scenario.agent();
    const approver = await scenario.agent();
    const id = await scenario.working(agent);
    const base = `/v1/tickets/${id}/compensations`;
    const mixed = await scenario.post(base, agent.session, {
      type: 'discount',
      hours: 2,
      reason: 'Se superó el plazo.',
    });
    expect(mixed.status).toBe(422);
    const compensationId = await scenario.create(base, agent, {
      type: 'discount',
      amount: '150000.50',
      reason: 'Se superó el plazo de solución.',
    });
    const [proposed] = await compensations(agent, id);
    expect(proposed).toMatchObject({ status: 'proposed', amount: '150000.50' });
    const decide = `${base}/${compensationId}/actions/decide`;
    const own = await scenario.action(decide, agent, proposed?.version ?? 0, { approve: true });
    expect(own.status).toBe(422);
    const ok = await scenario.action(decide, approver, proposed?.version ?? 0, { approve: true });
    expect(ok.status, ok.text).toBe(204);
    const [approved] = await compensations(agent, id);
    expect(approved).toMatchObject({ status: 'approved', decided_by: { id: approver.id } });
    await scenario.dispatchNotices();
    expect((await scenario.noticesFor(agent.id, 'svc_ticket_update')).join(' ')).toContain(
      'aprobaron',
    );
    expect(await scenario.auditActions(compensationId)).toEqual([
      'service.compensation.propose',
      'service.compensation.approve',
    ]);
  });
});

describe('acuerdos de tiempo', () => {
  it('Servicio los cambia y la nueva prioridad recalcula el tiquete', async () => {
    const agent = await scenario.agent();
    const list = slaPolicyListResponseSchema.parse(
      (await scenario.get('/v1/sla-policies', agent.session)).body,
    );
    expect(list.can_manage).toBe(true);
    expect(list.data.map((policy) => policy.priority)).toEqual([
      'critical',
      'high',
      'medium',
      'low',
    ]);
    const low = list.data.find((policy) => policy.priority === 'low');
    const bad = await scenario.put(
      `/v1/sla-policies/${low?.id ?? ''}`,
      agent,
      { first_response_hours: 10, resolution_hours: 5, calendar: 'business' },
      low?.version ?? 0,
    );
    expect(bad.status).toBe(422);

    const id = await scenario.ticket(agent, { priority: 'low' });
    const ticket = await scenario.ticketOf(agent, id);
    const body = { ...scenario.ticketBody(), priority: 'critical' };
    const updated = await scenario.put(`/v1/tickets/${id}`, agent, body, ticket.version);
    expect(updated.status, updated.text).toBe(204);
    expect((await scenario.ticketOf(agent, id)).sla).toMatchObject({
      calendar: 'continuous',
      resolution_hours: 4,
    });
  });
});

it('persiste el acuerdo de tiempo y rechaza versiones obsoletas', async () => {
  const agent = await scenario.agent();
  const list = async () =>
    slaPolicyListResponseSchema.parse((await scenario.get('/v1/sla-policies', agent.session)).body);
  const low = (await list()).data.find((policy) => policy.priority === 'low');
  if (low === undefined) throw new Error('No aparece el acuerdo de prioridad baja');
  const path = `/v1/sla-policies/${low.id}`;
  const body = { first_response_hours: 3, resolution_hours: 8, calendar: 'business' };
  const missing = '/v1/sla-policies/00000000-0000-4000-8000-000000000001';
  expect((await scenario.put(missing, agent, body, low.version)).status).toBe(404);
  expect((await scenario.put(path, agent, body, low.version)).status).toBe(204);
  expect((await scenario.put(path, agent, body, low.version)).status).toBe(409);
  expect((await list()).data.find((policy) => policy.id === low.id)).toMatchObject(body);
});

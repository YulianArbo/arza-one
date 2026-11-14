import {
  portalArticleListSchema,
  portalPqrsfFiledSchema,
  portalPqrsfListSchema,
  portalTicketDetailSchema,
  portalTicketListSchema,
  ticketDetailSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { PortalScenario } from './support/portal-scenario.js';

// Soporte desde el portal (B30, decisiones 3 y 7): el cliente pide soporte, ve solo la conversación
// pública (nunca las notas internas), y su respuesta reanuda el reloj si el tiquete esperaba al
// cliente. El usuario ve los suyos; el administrador, los de su empresa. Radica PQRSF y lee los
// artículos para clientes, no los internos. Cada paso deja su auditoría. Datos ficticios.

const scenario = new PortalScenario('portal: soporte');

const TICKET = {
  subject: 'No abre el reporte',
  description: 'El reporte mensual queda en blanco desde ayer.',
  category: 'support',
  priority: 'medium',
  project_id: null,
};

it('exporta únicamente los tiquetes y las PQRSF de la cuenta', async () => {
  const { user, admin } = await scenario.clientWorld();
  await scenario.create('/v1/portal/tickets', user, TICKET);
  await scenario.create('/v1/portal/tickets', admin, {
    ...TICKET,
    subject: 'Otro tiquete privado',
  });
  const subject = 'Demora en la entrega';
  const filed = await scenario.portalPost(user, '/v1/portal/pqrsf', {
    type: 'complaint',
    subject,
    description: 'La entrega del módulo se demoró dos semanas.',
  });
  expect(filed.status, filed.text).toBe(201);
  const exported = await scenario.portalPost(user, '/v1/portal/me/export');
  expect(exported.status, exported.text).toBe(201);
  expect(exported.body).toMatchObject({
    tickets: [expect.objectContaining({ subject: TICKET.subject })],
    pqrsf: [expect.objectContaining({ subject })],
  });
});

it('solo permite vincular un proyecto visible al radicar soporte', async () => {
  const world = await scenario.clientWorld();
  const body = { ...TICKET, project_id: world.projectId };
  const denied = await scenario.portalPost(world.user, '/v1/portal/tickets', body);
  expect(denied.status).toBe(404);
  const allowed = await scenario.portalPost(world.admin, '/v1/portal/tickets', body);
  expect(allowed.status, allowed.text).toBe(201);
  const list = portalTicketListSchema.parse(await scenario.read(world.admin, '/v1/portal/tickets'));
  expect(list.data).toContainEqual(
    expect.objectContaining({
      subject: body.subject,
      project: (await scenario.project(world.leader, world.projectId)).name,
    }),
  );
});

async function ticketOf(person: Person, id: string) {
  return portalTicketDetailSchema.parse(await scenario.read(person, `/v1/portal/tickets/${id}`));
}

async function internalVersion(agent: Person, id: string): Promise<number> {
  return ticketDetailSchema.parse(await scenario.read(agent, `/v1/tickets/${id}`)).version;
}

async function agentStep(agent: Person, id: string, action: string, body: object = {}) {
  const version = await internalVersion(agent, id);
  const response = await scenario.action(
    `/v1/tickets/${id}/actions/${action}`,
    agent,
    version,
    body,
  );
  expect(response.status, response.text).toBe(204);
}

describe('tiquetes del portal', () => {
  it('el usuario ve los suyos, el administrador los de su empresa, y otro usuario no', async () => {
    const world = await scenario.clientWorld();
    const id = await scenario.create('/v1/portal/tickets', world.user, TICKET);
    const peer = await scenario.readyPerson('CLIENTE_USUARIO', world.client.partyId);
    const list = async (person: Person) =>
      portalTicketListSchema
        .parse(await scenario.read(person, '/v1/portal/tickets'))
        .data.map((row) => row.id);
    expect(await list(world.user)).toEqual([id]);
    expect(await list(world.admin)).toEqual([id]);
    expect(await list(peer)).toEqual([]);
    expect((await scenario.get(`/v1/portal/tickets/${id}`, peer.session)).status).toBe(404);
    const agent = await scenario.person('servicio', ['SERVICIO']);
    const internal = ticketDetailSchema.parse(await scenario.read(agent, `/v1/tickets/${id}`));
    expect(internal).toMatchObject({ channel: 'portal', party: { id: world.client.partyId } });
    expect(await scenario.auditActionsOf(id)).toEqual(['service.ticket.create']);
  });
});

describe('conversación y reloj', () => {
  it('las notas internas no salen y la respuesta del cliente reanuda el reloj', async () => {
    const world = await scenario.clientWorld();
    const id = await scenario.create('/v1/portal/tickets', world.user, TICKET);
    const agent = await scenario.person('servicio', ['SERVICIO']);
    await agentStep(agent, id, 'assign', { assignee_id: agent.id });
    await agentStep(agent, id, 'start');
    const note = {
      body: 'Nota interna: revisar la base de reportes.',
      is_internal: true,
      from_client: false,
    };
    expect((await scenario.post(`/v1/tickets/${id}/messages`, agent.session, note)).status).toBe(
      201,
    );
    const answer = {
      body: '¿Desde qué navegador lo abre?',
      is_internal: false,
      from_client: false,
    };
    expect((await scenario.post(`/v1/tickets/${id}/messages`, agent.session, answer)).status).toBe(
      201,
    );
    await agentStep(agent, id, 'wait', { note: null });
    const seen = await ticketOf(world.user, id);
    expect(seen.status).toBe('waiting_customer');
    expect(seen.messages.map((row) => [row.author, row.body])).toEqual([
      ['Equipo de soporte', '¿Desde qué navegador lo abre?'],
    ]);
    const reply = await scenario.portalPost(world.user, `/v1/portal/tickets/${id}/messages`, {
      body: 'Desde el navegador del celular.',
    });
    expect(reply.status, reply.text).toBe(201);
    expect((await ticketOf(world.user, id)).status).toBe('in_progress');
    expect(await scenario.auditedActions(world.user)).toContain('service.ticket.message');
  });
});

it('admite mensajes de un tiquete abierto y rechaza mensajes después del cierre', async () => {
  const world = await scenario.clientWorld();
  const id = await scenario.create('/v1/portal/tickets', world.user, TICKET);
  const agent = await scenario.person('servicio', ['SERVICIO']);
  const path = `/v1/portal/tickets/${id}/messages`;
  const body = { body: 'Adjunto información para revisar el incidente.' };
  expect((await scenario.portalPost(world.user, path, body)).status).toBe(201);
  await agentStep(agent, id, 'assign', { assignee_id: agent.id });
  await agentStep(agent, id, 'start');
  await agentStep(agent, id, 'resolve', { resolution: 'Se corrigió el reporte.' });
  await agentStep(agent, id, 'close');
  expect((await scenario.portalPost(world.user, path, body)).status).toBe(409);
  const closed = await ticketOf(world.user, id);
  expect(closed.can_reply).toBe(false);
  const message = closed.messages.find((row) => row.body === body.body);
  expect(typeof message?.author).toBe('string');
  expect(closed.messages).toContainEqual(
    expect.objectContaining({
      body: body.body,
      from_client: true,
    }),
  );
});

describe('PQRSF y artículos', () => {
  it('radica una PQRSF con su cuenta y lee solo los artículos para clientes', async () => {
    const world = await scenario.clientWorld();
    const filed = await scenario.portalPost(world.user, '/v1/portal/pqrsf', {
      type: 'complaint',
      subject: 'Demora en la entrega',
      description: 'La entrega del módulo se demoró dos semanas.',
    });
    expect(filed.status, filed.text).toBe(201);
    const { code } = portalPqrsfFiledSchema.parse(filed.body);
    const mine = portalPqrsfListSchema.parse(await scenario.read(world.user, '/v1/portal/pqrsf'));
    expect(mine.data.map((row) => [row.code, row.status])).toEqual([[code, 'filed']]);
    expect(
      portalPqrsfListSchema.parse(await scenario.read(world.admin, '/v1/portal/pqrsf')).data,
    ).toEqual([]);
    const ids = await publishedArticles();
    const listed = portalArticleListSchema.parse(
      await scenario.read(world.user, '/v1/portal/articles'),
    );
    expect(listed.data.map((row) => row.id)).toContain(ids.client);
    expect(listed.data.map((row) => row.id)).not.toContain(ids.internal);
    const matching = portalArticleListSchema.parse(
      await scenario.read(world.user, '/v1/portal/articles?q=Facturas'),
    );
    expect(matching.data.map((row) => row.id)).toEqual([ids.client]);
    expect(
      (await scenario.get(`/v1/portal/articles/${ids.client}`, world.user.session)).status,
    ).toBe(200);
    expect(
      (await scenario.get(`/v1/portal/articles/${ids.internal}`, world.user.session)).status,
    ).toBe(404);
  });
});

/** Un artículo publicado para clientes y uno interno. */
async function publishedArticles(): Promise<{ client: string; internal: string }> {
  const agent = await scenario.person('servicio', ['SERVICIO']);
  const body = (audience: string) => ({
    title: `Cómo descargar su factura (${audience})`,
    summary: 'Pasos para descargar la factura desde el portal.',
    body: 'Entre a Facturas, elija la factura y pulse Descargar.',
    category: 'billing',
    audience,
  });
  const ids: string[] = [];
  for (const audience of ['client', 'internal']) {
    const id = await scenario.create('/v1/kb-articles', agent, body(audience));
    const published = await scenario.action(`/v1/kb-articles/${id}/actions/publish`, agent, 1);
    expect(published.status, published.text).toBe(204);
    ids.push(id);
  }
  return { client: ids[0] ?? '', internal: ids[1] ?? '' };
}

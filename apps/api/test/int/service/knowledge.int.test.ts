import { kbArticleDetailSchema, kbArticleListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { CareScenario } from './support/care-scenario.js';

// Base de conocimiento del B29 (ficha 17.9, decisión 10): Servicio escribe, publica y archiva; todo el
// equipo interno lee lo publicado; un borrador no existe para quien no administra; otra empresa no ve
// nada. Datos ficticios.

const scenario = new CareScenario('base de conocimiento');

const ARTICLE = {
  title: 'Cómo restablecer su contraseña',
  summary: 'Pasos para recuperar el acceso a ARZA ONE si olvidó su contraseña.',
  body: 'Abra la página de ingreso.\n\n- Elija «¿Olvidó su contraseña?».\n- Revise su correo.',
  category: 'platform',
  audience: 'internal',
};

async function article(person: Person, overrides: object = {}): Promise<string> {
  return scenario.create('/v1/kb-articles', person, { ...ARTICLE, ...overrides });
}

async function detail(person: Person, id: string) {
  const response = await scenario.get(`/v1/kb-articles/${id}`, person.session);
  expect(response.status, response.text).toBe(200);
  return kbArticleDetailSchema.parse(response.body);
}

async function list(person: Person, query = '') {
  const response = await scenario.get(`/v1/kb-articles${query}`, person.session);
  expect(response.status, response.text).toBe(200);
  return kbArticleListResponseSchema.parse(response.body);
}

async function stepOk(person: Person, id: string, action: string): Promise<void> {
  const { version } = await detail(person, id);
  const response = await scenario.action(
    `/v1/kb-articles/${id}/actions/${action}`,
    person,
    version,
  );
  expect(response.status, response.text).toBe(204);
}

it('rechaza la edición obsoleta y la publicación duplicada', async () => {
  const agent = await scenario.agent();
  const id = await article(agent);
  const path = `/v1/kb-articles/${id}`;
  const draft = await detail(agent, id);
  expect((await scenario.put(path, agent, ARTICLE, draft.version + 1)).status).toBe(409);
  expect((await scenario.action(`${path}/actions/publish`, agent, draft.version + 1)).status).toBe(
    409,
  );
  await stepOk(agent, id, 'publish');
  const published = await detail(agent, id);
  expect((await scenario.action(`${path}/actions/publish`, agent, published.version)).status).toBe(
    409,
  );
  await stepOk(agent, id, 'archive');
  const archived = await detail(agent, id);
  expect((await scenario.action(`${path}/actions/archive`, agent, archived.version)).status).toBe(
    409,
  );
  await stepOk(agent, id, 'publish');
  expect((await detail(agent, id)).status).toBe('published');
});

it('pagina artículos publicados con el cursor de la página anterior', async () => {
  const agent = await scenario.agent();
  const first = await article(agent, { title: 'Rotación de claves de prueba' });
  const second = await article(agent, { title: 'Rotación de claves de respaldo' });
  await stepOk(agent, first, 'publish');
  await stepOk(agent, second, 'publish');
  const query = '?q=Rotaci%C3%B3n%20de%20claves&status=published&limit=1';
  const page = await list(agent, query);
  const cursor = page.next_cursor;
  if (cursor === null) throw new Error('Falta el cursor de la segunda página');
  const next = await list(agent, `${query}&cursor=${cursor}`);
  expect(next.next_cursor).toBeNull();
  expect([...page.data, ...next.data].map((row) => row.id).sort()).toEqual([first, second].sort());
});

describe('ciclo del artículo', () => {
  it('nace en borrador, se publica, se edita y se archiva, con su auditoría', async () => {
    const agent = await scenario.agent();
    const colleague = await scenario.person('colaborador', ['COLABORADOR']);
    const id = await article(agent);
    expect((await detail(agent, id)).status).toBe('draft');
    expect((await scenario.get(`/v1/kb-articles/${id}`, colleague.session)).status).toBe(404);
    await stepOk(agent, id, 'publish');
    const published = await detail(colleague, id);
    expect(published).toMatchObject({ status: 'published', can: { edit: false } });
    expect(published.published_at).not.toBeNull();
    const edit = await scenario.put(
      `/v1/kb-articles/${id}`,
      agent,
      { ...ARTICLE, title: 'Cómo cambiar su contraseña' },
      published.version,
    );
    expect(edit.status, edit.text).toBe(204);
    await stepOk(agent, id, 'archive');
    expect((await scenario.get(`/v1/kb-articles/${id}`, colleague.session)).status).toBe(404);
    const archived = await detail(agent, id);
    expect(archived.can).toMatchObject({ edit: false, publish: true, archive: false });
    expect(await scenario.auditActions(id)).toEqual([
      'service.kb.create',
      'service.kb.publish',
      'service.kb.update',
      'service.kb.archive',
    ]);
  });
});

describe('ciclo del artículo', () => {
  it('busca en el contenido y filtra por público', async () => {
    const agent = await scenario.agent();
    const id = await article(agent, {
      title: 'Facturas electrónicas',
      body: 'La factura llega al correo registrado del cliente con su código único.',
      category: 'billing',
      audience: 'client',
    });
    await stepOk(agent, id, 'publish');
    const found = await list(agent, '?q=código único&audience=client&category=billing');
    expect(found.data.map((row) => row.id)).toEqual([id]);
    expect(found.can_manage).toBe(true);
    const drafts = await list(agent, '?status=draft');
    expect(drafts.data.every((row) => row.status === 'draft')).toBe(true);
  });
});

describe('ciclo del artículo', () => {
  it('un artículo archivado no se edita', async () => {
    const agent = await scenario.agent();
    const id = await article(agent);
    await stepOk(agent, id, 'archive');
    const { version } = await detail(agent, id);
    const edit = await scenario.put(`/v1/kb-articles/${id}`, agent, ARTICLE, version);
    expect(edit.status).toBe(409);
  });
});

describe('permiso denegado y aislamiento', () => {
  it('cualquier rol interno lee, pero solo Servicio escribe', async () => {
    const agent = await scenario.agent();
    const accountant = await scenario.person('contador', ['CONTADOR']);
    const tech = await scenario.person('lider-tecnico', ['LIDER_TECNICO']);
    const id = await article(agent);
    await stepOk(agent, id, 'publish');
    expect((await list(accountant)).can_manage).toBe(false);
    expect((await detail(accountant, id)).id).toBe(id);
    const create = await scenario.post('/v1/kb-articles', tech.session, ARTICLE);
    expect(create.status).toBe(403);
    const archive = await scenario.action(`/v1/kb-articles/${id}/actions/archive`, tech, 2);
    expect(archive.status).toBe(403);
  });
});

describe('permiso denegado y aislamiento', () => {
  it('otra empresa no ve ni toca los artículos de esta', async () => {
    const agent = await scenario.agent();
    const stranger = await scenario.agent(scenario.otherTenant.id);
    const id = await article(agent);
    await stepOk(agent, id, 'publish');
    expect((await scenario.get(`/v1/kb-articles/${id}`, stranger.session)).status).toBe(404);
    expect((await list(stranger)).data.map((row) => row.id)).not.toContain(id);
    const archive = await scenario.action(`/v1/kb-articles/${id}/actions/archive`, stranger, 2);
    expect(archive.status).toBe(404);
  });
});

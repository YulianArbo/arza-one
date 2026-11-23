import {
  pageListResponseSchema,
  publicPageListResponseSchema,
  publicPageSchema,
  siteCreatedResponseSchema,
} from '@arza/contracts';
import { expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';

import { SiteScenario } from './support/site-scenario.js';

// Páginas institucionales administrables (B41, ficha 17.18; decisión 10): el visitante solo ve las
// publicadas de la empresa del sitio.

const scenario = new SiteScenario('sitio paginas');

function page(slug = `nosotros-${uuidv7().slice(-6)}`) {
  return {
    slug,
    title: 'Nosotros',
    summary: 'Quiénes somos',
    body: 'Somos una empresa ficticia de prueba.\n\n## Cómo trabajamos\n\n- Con orden.',
  };
}

it('se crea en borrador, se publica, se ve en el sitio y se retira', async () => {
  const sales = await scenario.person('comercial', ['COMERCIAL']);
  const body = page();
  const created = await scenario.post('/v1/site/pages', sales.session, body);
  const { id } = siteCreatedResponseSchema.parse(created.body);
  expect((await scenario.publicGet(`pages/${body.slug}`)).status).toBe(404);
  const path = `/v1/site/pages/${id}`;
  expect(
    (await scenario.act(`${path}/actions`, sales.session, 1, { action: 'publish' })).status,
  ).toBe(204);
  const visible = publicPageSchema.parse((await scenario.publicGet(`pages/${body.slug}`)).body);
  expect(visible).toMatchObject({ title: 'Nosotros', body: body.body });
  const menu = publicPageListResponseSchema.parse((await scenario.publicGet('pages')).body);
  expect(menu.data).toContainEqual({ slug: body.slug, title: 'Nosotros' });
  const edited = { ...body, title: 'Quiénes somos' };
  expect((await scenario.patch(path, sales.session, edited, 2)).status).toBe(204);
  expect((await scenario.patch(path, sales.session, edited, 2)).status).toBe(409);
  const again = await scenario.act(`${path}/actions`, sales.session, 3, { action: 'publish' });
  expect(again.status).toBe(409);
  expect(
    (await scenario.act(`${path}/actions`, sales.session, 3, { action: 'withdraw' })).status,
  ).toBe(204);
  expect((await scenario.publicGet(`pages/${body.slug}`)).status).toBe(404);
  const audit = await scenario.inTenant((tx) =>
    tx.auditEvent.findMany({ where: { entityId: id }, orderBy: { seq: 'asc' } }),
  );
  expect(audit.map((event) => event.action)).toEqual([
    'web.page.create',
    'web.page.publish',
    'web.page.update',
    'web.page.withdraw',
  ]);
});

it('la dirección no se repite ni ocupa una de la plataforma', async () => {
  const sales = await scenario.person('comercial-direcciones', ['COMERCIAL']);
  const body = page();
  expect((await scenario.post('/v1/site/pages', sales.session, body)).status).toBe(201);
  const repeated = await scenario.post('/v1/site/pages', sales.session, body);
  expect(repeated.status).toBe(409);
  expect(repeated.body).toMatchObject({ error: { code: 'SITE_SLUG_TAKEN' } });
  const reserved = await scenario.post('/v1/site/pages', sales.session, page('iniciar-sesion'));
  expect(reserved.status).toBe(422);
});

it('sin permiso no se administra y cada empresa ve solo sus páginas', async () => {
  const [worker, stranger] = await Promise.all([
    scenario.person('colaborador', ['COLABORADOR']),
    scenario.person('comercial-ajeno', ['COMERCIAL'], { tenantId: scenario.otherTenant.id }),
  ]);
  expect((await scenario.get('/v1/site/pages', worker.session)).status).toBe(403);
  expect((await scenario.post('/v1/site/pages', worker.session, page())).status).toBe(403);
  const body = page();
  const { id } = siteCreatedResponseSchema.parse(
    (await scenario.post('/v1/site/pages', stranger.session, body)).body,
  );
  await scenario.act(`/v1/site/pages/${id}/actions`, stranger.session, 1, { action: 'publish' });
  expect((await scenario.publicGet(`pages/${body.slug}`)).status).toBe(404);
  const sales = await scenario.person('comercial-propio', ['COMERCIAL']);
  const mine = pageListResponseSchema.parse(
    (await scenario.get('/v1/site/pages', sales.session)).body,
  );
  expect(mine.data.find((row) => row.id === id)).toBeUndefined();
});

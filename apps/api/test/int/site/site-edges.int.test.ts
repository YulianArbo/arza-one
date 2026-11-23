import {
  legalTextListResponseSchema,
  pageListResponseSchema,
  publicPrivacyPolicySchema,
  siteCreatedResponseSchema,
  unsubscribeResultSchema,
} from '@arza/contracts';
import { expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';

import { unsubscribeTokenHash } from '../../../src/modules/web/application/submissions.js';
import { contactNoticeId } from '../party/support/party-scenario.js';
import { LEGAL_BODY, SiteScenario } from './support/site-scenario.js';

// Bordes del sitio (B41): registros que no existen, versiones viejas, el concepto jurídico que no
// sirve, la política de tratamiento publicada en Privacidad y un correo que ya se había dado de
// baja por otro enlace. Datos ficticios.

const scenario = new SiteScenario('sitio bordes');

it('la política de tratamiento publicada en Privacidad se ve en el sitio', async () => {
  await contactNoticeId(scenario);
  const response = await scenario.publicGet('legal/privacy-policy');
  expect(response.status, response.text).toBe(200);
  expect(publicPrivacyPolicySchema.parse(response.body).version_number).toBeGreaterThan(0);
  expect((await scenario.publicGet('pages/no-existe')).status).toBe(404);
});

it('las páginas que no existen responden 404 y la lista dice quién las cambió', async () => {
  const sales = await scenario.person('comercial-bordes', ['COMERCIAL']);
  const missing = `/v1/site/pages/${uuidv7()}`;
  const body = { slug: `bordes-${uuidv7().slice(-6)}`, title: 'Bordes', body: LEGAL_BODY };
  expect((await scenario.patch(missing, sales.session, body, 1)).status).toBe(404);
  const act = await scenario.act(`${missing}/actions`, sales.session, 1, { action: 'publish' });
  expect(act.status).toBe(404);
  const { id } = siteCreatedResponseSchema.parse(
    (await scenario.post('/v1/site/pages', sales.session, body)).body,
  );
  const withdraw = await scenario.act(`/v1/site/pages/${id}/actions`, sales.session, 1, {
    action: 'withdraw',
  });
  expect(withdraw.status).toBe(409);
  const stale = await scenario.act(`/v1/site/pages/${id}/actions`, sales.session, 7, {
    action: 'publish',
  });
  expect(stale.status).toBe(409);
  const list = pageListResponseSchema.parse(
    (await scenario.get('/v1/site/pages', sales.session)).body,
  );
  expect(list.data.find((page) => page.id === id)?.updated_by?.id).toBe(sales.id);
});

it('los textos que no existen, las versiones viejas y el concepto que no sirve se rechazan', async () => {
  const [officer, director] = await Promise.all([
    scenario.person('oficial-bordes', ['OFICIAL_DATOS']),
    scenario.person('direccion-bordes', ['DIRECCION']),
  ]);
  const missing = `/v1/site/legal-texts/${uuidv7()}`;
  const edit = { title: 'Texto de bordes', body: LEGAL_BODY };
  expect((await scenario.patch(missing, officer.session, edit, 1)).status).toBe(404);
  expect((await scenario.act(`${missing}/actions/approve`, director.session, 1)).status).toBe(404);
  const body = { key: 'site_terms', ...edit };
  const { id } = siteCreatedResponseSchema.parse(
    (await scenario.post('/v1/site/legal-texts', officer.session, body)).body,
  );
  const path = `/v1/site/legal-texts/${id}`;
  expect((await scenario.patch(path, officer.session, edit, 5)).status).toBe(409);
  const concept = { concept_file_id: uuidv7() };
  const invalid = await scenario.act(`${path}/actions/approve`, director.session, 1, concept);
  expect(invalid.status).toBe(422);
  const list = legalTextListResponseSchema.parse(
    (await scenario.get('/v1/site/legal-texts', officer.session)).body,
  );
  expect(list.data.find((text) => text.id === id)).toMatchObject({
    status: 'draft',
    approved_by: null,
    effective_from: null,
    drafted_by: { id: officer.id },
  });
});

/** Un contacto recibido cuyo enlace de baja tiene la llave dada. */
async function contactWithLink(email: string, token: string): Promise<void> {
  const receipt = await scenario.submit('contact', await scenario.contactForm({ email }));
  await scenario.inTenant((tx) =>
    tx.webFormSubmission.updateMany({
      where: { code: receipt.code },
      data: { unsubscribeTokenHash: unsubscribeTokenHash(token) },
    }),
  );
}

it('si el correo ya se dio de baja por otro enlace, lo dice sin duplicar la baja', async () => {
  const email = `repetido.${uuidv7().slice(-8)}@ejemplo.test`;
  const first = `primera-llave-${uuidv7()}`;
  const second = `segunda-llave-${uuidv7()}`;
  await contactWithLink(email, first);
  await contactWithLink(email, second);
  const one = unsubscribeResultSchema.parse(
    (await scenario.public('unsubscribe', { token: first })).body,
  );
  const response = await scenario.public('unsubscribe', { token: second });
  expect(response.status, response.text).toBe(200);
  const two = unsubscribeResultSchema.parse(response.body);
  expect([one.already, two.already]).toEqual([false, true]);
  const rows = await scenario.inTenant((tx) => tx.webUnsubscribe.count({ where: { email } }));
  expect(rows).toBe(1);
});
